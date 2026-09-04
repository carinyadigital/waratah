import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgent, defineTool } from '../agent/create-agent.js';
import { InMemorySessionBackend } from '../context/in-memory-backend.js';
import { ConfinedSessionFilesystem } from '../context/session-filesystem.js';
import { PHASE_1_LIMITS } from '../harness/limits.js';
import type { ModelCompletionRequest } from '../harness/model-adapter.js';
import { runAgent } from '../harness/run-agent.js';
import type {
  AgentDefinition,
  ModelAdapter,
  ModelResult,
  Schema,
  SessionFilesystem,
} from '../shared/contracts.js';
import { findingPath } from '../shared/contracts.js';
import { WaratahError } from '../shared/errors.js';
import { asSessionId, createTurnId } from '../shared/ids.js';

const emptySchema: Schema<Record<string, never>> = {
  parse(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('Expected an object');
    }
    return {};
  },
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('task delegation', () => {
  it('uses isolated messages and returns only the canonical finding summary', async () => {
    const requests: ModelCompletionRequest[] = [];
    const model: ModelAdapter = {
      complete: vi.fn(async (request: ModelCompletionRequest) => {
        requests.push({ ...request, messages: [...request.messages] });
        if (request.model === 'lead-model') {
          const taskResult = lastToolResult(request);
          if (taskResult === undefined) {
            return {
              type: 'tool_calls' as const,
              toolCalls: [
                {
                  id: 'delegate',
                  name: 'task',
                  arguments: {
                    subagent: 'systems-analyst',
                    instruction: 'Inspect the repository.',
                    findingPath: '/session/redirect/findings/stolen.md',
                  },
                },
              ],
            };
          }
          const result = JSON.parse(taskResult) as Record<string, unknown>;
          expect(result).toMatchObject({
            subagent: 'systems-analyst',
            findingPath: expect.stringMatching(/\/findings\/systems-analyst\.md$/),
            summary: 'Condensed repository finding',
          });
          expect(taskResult).not.toContain('RAW WORKER OUTPUT');
          expect(taskResult).not.toContain('sensitive diff body');
          return { type: 'message' as const, content: 'complete' };
        }

        expect(
          request.messages.some((message) => message.content.includes('lead conversation')),
        ).toBe(false);
        expect(request.messages).toContainEqual({
          role: 'user',
          content: 'Inspect the repository.',
        });
        expect(request.messages).toContainEqual(
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Worker instructions only.'),
          }),
        );
        const toolResult = lastToolResult(request);
        return toolResult === undefined
          ? writeFindingCall(request, 'Condensed repository finding\n\nsensitive diff body')
          : { type: 'message' as const, content: 'RAW WORKER OUTPUT' };
      }),
    };
    const harness = await createHarness(model, { message: 'lead conversation' });

    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });

    const workerRequest = requests.find((request) => request.model === 'worker-model');
    expect(workerRequest?.messages.some((message) => message.role === 'assistant')).toBe(false);
    await expect(
      harness.files.read(findingPath(harness.sessionId, 'systems-analyst')),
    ).resolves.toBe('Condensed repository finding\n\nsensitive diff body');
  });

  it('rejects an undeclared subagent without starting a subagent run', async () => {
    const model = scriptedModel([
      {
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'delegate',
            name: 'task',
            arguments: { subagent: 'not-declared', instruction: 'Run.' },
          },
        ],
      },
    ]);
    const harness = await createHarness(model);

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'SUBAGENT_NOT_DECLARED',
    });
    expect(model.complete).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', undefined],
    ['empty', ' \n\t'],
  ])('fails when the canonical finding is %s', async (_case, finding) => {
    const model = delegationModel(finding);
    const harness = await createHarness(model);

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'SUBAGENT_FINDING_MISSING',
    });
  });

  it('invalidates a prior finding before delegating the same subagent again', async () => {
    const publish = vi.fn(async () => ({ messageId: 'message-1' }));
    const publishTool = defineTool({
      name: 'slack-post',
      description: 'Publish the digest.',
      inputSchema: emptySchema,
      execute: publish,
    });
    let leadRequests = 0;
    let workerRequests = 0;
    const model: ModelAdapter = {
      complete: vi.fn(async (request: ModelCompletionRequest): Promise<ModelResult> => {
        if (request.model === 'lead-model') {
          leadRequests += 1;
          if (leadRequests <= 2) {
            return {
              type: 'tool_calls' as const,
              toolCalls: [
                {
                  id: `delegate-${leadRequests}`,
                  name: 'task',
                  arguments: {
                    subagent: 'systems-analyst',
                    instruction: `Run ${leadRequests}.`,
                  },
                },
              ],
            };
          }
          return toolCall('publish', 'slack-post');
        }

        workerRequests += 1;
        return workerRequests === 1
          ? writeFindingCall(request, 'Finding from the first delegation')
          : { type: 'message' as const, content: 'worker complete' };
      }),
    };
    const harness = await createHarness(model, { leadTools: [publishTool] });

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'SUBAGENT_FINDING_MISSING',
    });

    expect(leadRequests).toBe(2);
    expect(publish).not.toHaveBeenCalled();
    await expect(
      harness.files.read(findingPath(harness.sessionId, 'systems-analyst')),
    ).resolves.toBe('');
  });

  it('preserves operational errors while reading an existing finding', async () => {
    const harness = await createHarness(delegationModel('finding'));
    const files: SessionFilesystem = {
      read: vi.fn(async () => {
        throw new WaratahError(
          'PAYLOAD_LIMIT_EXCEEDED',
          'The payload exceeds the allowed size. Reduce the payload and try again.',
        );
      }),
      write: harness.files.write.bind(harness.files),
      list: harness.files.list.bind(harness.files),
    };

    await expect(runAgent({ ...harness.options, files })).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
  });

  it('shares the step limit across the lead and its subagent', async () => {
    const accepted = await createHarness(delegationModel('finding'));
    await expect(
      runAgent({
        ...accepted.options,
        limits: { ...PHASE_1_LIMITS, maxSteps: 6 },
      }),
    ).resolves.toMatchObject({ content: 'complete', steps: 6 });

    const rejected = await createHarness(delegationModel('finding'));
    await expect(
      runAgent({
        ...rejected.options,
        limits: { ...PHASE_1_LIMITS, maxSteps: 5 },
      }),
    ).rejects.toMatchObject({ code: 'STEP_LIMIT_EXCEEDED' });
  });

  it('accepts the finding byte limit and rejects one byte beyond it', async () => {
    const accepted = await createHarness(
      delegationModel('a'.repeat(PHASE_1_LIMITS.maxFindingBytes)),
    );
    await expect(runAgent(accepted.options)).resolves.toMatchObject({ content: 'complete' });

    const rejected = await createHarness(
      delegationModel('a'.repeat(PHASE_1_LIMITS.maxFindingBytes + 1)),
    );
    await expect(runAgent(rejected.options)).rejects.toMatchObject({
      code: 'PAYLOAD_LIMIT_EXCEEDED',
    });
  });

  it('inherits the parent abort signal and cannot outlive it', async () => {
    const signals: AbortSignal[] = [];
    const model: ModelAdapter = {
      complete: vi.fn(async (request: ModelCompletionRequest) => {
        signals.push(request.signal);
        if (request.model === 'lead-model') {
          return {
            type: 'tool_calls' as const,
            toolCalls: [
              {
                id: 'delegate',
                name: 'task',
                arguments: { subagent: 'systems-analyst', instruction: 'Wait.' },
              },
            ],
          };
        }
        return new Promise<ModelResult>(() => {});
      }),
    };
    const harness = await createHarness(model);
    const startedAt = Date.now();

    await expect(
      runAgent({ ...harness.options, signal: AbortSignal.timeout(250) }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/^(MODEL_ERROR|TOOL_EXECUTION_FAILED)$/),
    });

    expect(signals).toHaveLength(2);
    expect(signals[1]).toBe(signals[0]);
    expect(signals[0]?.aborted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('does not treat a model-supplied alternate path as the finding', async () => {
    let alternatePath = '';
    const model: ModelAdapter = {
      complete: vi.fn(async (request: ModelCompletionRequest) => {
        if (request.model === 'lead-model') {
          return {
            type: 'tool_calls' as const,
            toolCalls: [
              {
                id: 'delegate',
                name: 'task',
                arguments: { subagent: 'systems-analyst', instruction: 'Write elsewhere.' },
              },
            ],
          };
        }
        if (lastToolResult(request) === undefined) {
          const required = requiredFindingPath(request);
          alternatePath = required.replace('systems-analyst.md', 'redirected.md');
          return {
            type: 'tool_calls' as const,
            toolCalls: [
              {
                id: 'write-redirect',
                name: 'write',
                arguments: { path: alternatePath, content: 'redirected' },
              },
            ],
          };
        }
        return { type: 'message' as const, content: 'done' };
      }),
    };
    const harness = await createHarness(model);

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'SUBAGENT_FINDING_MISSING',
    });
    await expect(harness.files.read(alternatePath as never)).resolves.toBe('redirected');
  });

  it('enforces lead and worker tool scope before either side effect', async () => {
    const slackPost = vi.fn(async () => ({ messageId: 'message-1' }));
    const gitRead = vi.fn(async () => ({ commits: [] }));
    const leadTool = defineTool({
      name: 'slack-post',
      description: 'Post the digest.',
      inputSchema: emptySchema,
      execute: slackPost,
    });
    const workerTool = defineTool({
      name: 'git-reader',
      description: 'Read repository changes.',
      inputSchema: emptySchema,
      execute: gitRead,
    });
    const model = scopedToolModel();
    const harness = await createHarness(model, {
      leadTools: [leadTool],
      workerTools: [workerTool],
    });

    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });

    expect(slackPost).toHaveBeenCalledOnce();
    expect(gitRead).toHaveBeenCalledOnce();
    const leadRequests = model.requests.filter((request) => request.model === 'lead-model');
    const workerRequests = model.requests.filter((request) => request.model === 'worker-model');
    expect(leadRequests[0]?.tools.map((tool) => tool.name)).not.toContain('git-reader');
    expect(workerRequests[0]?.tools.map((tool) => tool.name)).not.toContain('slack-post');
  });
});

function delegationModel(finding: string | undefined) {
  return {
    complete: vi.fn(async (request: ModelCompletionRequest): Promise<ModelResult> => {
      if (request.model === 'lead-model') {
        return lastToolResult(request) === undefined
          ? {
              type: 'tool_calls',
              toolCalls: [
                {
                  id: 'delegate',
                  name: 'task',
                  arguments: { subagent: 'systems-analyst', instruction: 'Inspect.' },
                },
              ],
            }
          : { type: 'message', content: 'complete' };
      }
      if (lastToolResult(request) === undefined && finding !== undefined) {
        return writeFindingCall(request, finding);
      }
      return { type: 'message', content: 'worker complete' };
    }),
  } satisfies ModelAdapter;
}

function scopedToolModel() {
  const requests: ModelCompletionRequest[] = [];
  const adapter: ModelAdapter = {
    complete: vi.fn(async (request: ModelCompletionRequest): Promise<ModelResult> => {
      requests.push(request);
      const toolResults = request.messages.filter((message) => message.role === 'tool');
      if (request.model === 'worker-model') {
        if (toolResults.length === 0) {
          return toolCall('worker-slack', 'slack-post');
        }
        if (toolResults.length === 1) {
          expect(JSON.parse(toolResults[0]?.content ?? '{}')).toMatchObject({
            error: { code: 'UNKNOWN_TOOL' },
          });
          return toolCall('worker-git', 'git-reader');
        }
        if (toolResults.length === 2) {
          return writeFindingCall(request, 'Scoped tools verified');
        }
        return { type: 'message', content: 'worker complete' };
      }

      if (toolResults.length === 0) {
        return {
          type: 'tool_calls',
          toolCalls: [
            {
              id: 'delegate',
              name: 'task',
              arguments: { subagent: 'systems-analyst', instruction: 'Check scope.' },
            },
          ],
        };
      }
      if (toolResults.length === 1) {
        return toolCall('lead-git', 'git-reader');
      }
      if (toolResults.length === 2) {
        expect(JSON.parse(toolResults[1]?.content ?? '{}')).toMatchObject({
          error: { code: 'UNKNOWN_TOOL' },
        });
        return toolCall('lead-slack', 'slack-post');
      }
      return { type: 'message', content: 'complete' };
    }),
  };
  return Object.assign(adapter, { requests });
}

function toolCall(id: string, name: string): ModelResult {
  return { type: 'tool_calls', toolCalls: [{ id, name, arguments: {} }] };
}

function writeFindingCall(request: ModelCompletionRequest, content: string): ModelResult {
  return {
    type: 'tool_calls',
    toolCalls: [
      {
        id: 'write-finding',
        name: 'write',
        arguments: { path: requiredFindingPath(request), content },
      },
    ],
  };
}

function requiredFindingPath(request: ModelCompletionRequest): string {
  const message = request.messages.find(
    (entry) => entry.role === 'system' && entry.content.includes('required final finding'),
  );
  const match = message?.content.match(/(\/session\/\S+\/findings\/\S+\.md)/);
  if (match?.[1] === undefined) {
    throw new Error('Missing required finding path');
  }
  return match[1];
}

function lastToolResult(request: ModelCompletionRequest): string | undefined {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index];
    if (message?.role === 'tool') {
      return message.content;
    }
  }
  return undefined;
}

function scriptedModel(results: readonly ModelResult[]) {
  const queue = [...results];
  return {
    complete: vi.fn(async () => {
      const result = queue.shift();
      if (result === undefined) {
        throw new Error('Fake model script exhausted');
      }
      return result;
    }),
  } satisfies ModelAdapter;
}

async function createHarness(
  model: ModelAdapter,
  options: {
    readonly message?: string;
    readonly leadTools?: AgentDefinition['tools'];
    readonly workerTools?: AgentDefinition['tools'];
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'waratah-subagent-'));
  directories.push(directory);
  const agentDirectory = join(directory, 'agent');
  const workerDirectory = join(agentDirectory, 'subagents', 'systems-analyst');
  await mkdir(workerDirectory, { recursive: true });
  await writeFile(join(directory, 'AGENTS.md'), 'Keep data local.\n');
  await writeFile(join(agentDirectory, 'agent.ts'), 'export {};\n');
  await writeFile(join(agentDirectory, 'instructions.md'), 'Lead instructions only.\n');
  await writeFile(join(workerDirectory, 'agent.ts'), 'export {};\n');
  await writeFile(join(workerDirectory, 'instructions.md'), 'Worker instructions only.\n');

  const worker = createAgent({
    name: 'systems-analyst',
    kind: 'subagent',
    model: 'worker-model',
    instructions: ['./instructions.md'],
    skills: [],
    memory: [],
    tools: options.workerTools ?? [],
    subagents: [],
    channels: [],
  });
  const lead = createAgent({
    name: 'lead',
    model: 'lead-model',
    instructions: ['./instructions.md'],
    skills: [],
    memory: [],
    tools: options.leadTools ?? [],
    subagents: [worker],
    channels: [],
  });
  const sessionId = asSessionId('session-one');
  const files: SessionFilesystem = new ConfinedSessionFilesystem(
    sessionId,
    new InMemorySessionBackend(),
  );

  return {
    files,
    sessionId,
    options: {
      agent: lead,
      agentFile: join(agentDirectory, 'agent.ts'),
      projectRoot: directory,
      sessionId,
      turnId: createTurnId(),
      files,
      modelAdapter: model,
      input: options.message ?? 'Delegate the task.',
    },
  };
}
