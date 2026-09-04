import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgent, DEFAULT_LIMITS, WaratahError } from 'waratah';

import { InMemorySessionBackend } from '../../../packages/waratah/src/context/in-memory-backend.js';
import { ConfinedSessionFilesystem } from '../../../packages/waratah/src/context/session-filesystem.js';
import { runAgent } from '../../../packages/waratah/src/harness/run-agent.js';
import { createJsonlSink } from '../../../packages/waratah/src/observability/jsonl-sink.js';
import { createMemoryCheckpointer } from '../../../packages/waratah/src/session/checkpointer.js';
import { CreateSessionService } from '../../../packages/waratah/src/session/create-session.js';
import type {
  ModelAdapter,
  ModelResult,
  SessionFilesystem,
} from '../../../packages/waratah/src/shared/contracts.js';
import { findingPath } from '../../../packages/waratah/src/shared/contracts.js';
import { asSessionId, createTurnId } from '../../../packages/waratah/src/shared/ids.js';
import type { ModelCompletionRequest } from '../../../packages/waratah/src/harness/model-adapter.js';

import { createGitReaderTool } from '../agent/subagents/systems-analyst/tools/git-reader.js';
import { createSlackPostTool } from '../agent/tools/slack-post.js';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOOKBACK = {
  since: '2026-09-03T00:00:00.000Z',
  until: '2026-09-04T00:00:00.000Z',
};
const SEEDED_SECRET = 'xoxb-seeded-e2e-token';
const EMPTY_WINDOW = 'No notable changes in this window';
const FINDING = [
  'Auth login changed in this window.',
  'Pull request: https://github.com/acme/app/pull/12',
].join('\n');

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('daily-changes fixture', () => {
  it('delegates analysis, writes findings, and posts one digest', async () => {
    const gitRead = vi.fn(async () => notableChanges());
    const slackPost = vi.fn(async (_text: string) => ({ ok: true as const, messageTs: '1.0' }));
    const harness = await createFixtureHarness(delegationModel(), { gitRead, slackPost });

    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });

    expect(gitRead).toHaveBeenCalledOnce();
    expect(slackPost).toHaveBeenCalledOnce();
    expect(slackPost.mock.calls[0]?.[0]).toContain('Auth login changed');
    await expect(
      harness.files.read(findingPath(harness.sessionId, 'systems-analyst')),
    ).resolves.toContain('https://github.com/acme/app/pull/12');
  });

  it('posts a no-change digest when the git window is empty', async () => {
    const gitRead = vi.fn(async () => emptyChanges());
    const slackPost = vi.fn(async (text: string) => ({ ok: true, messageTs: '1.0', text }));
    const harness = await createFixtureHarness(delegationModel(EMPTY_WINDOW), { gitRead, slackPost });

    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });

    expect(slackPost).toHaveBeenCalledOnce();
    expect(slackPost.mock.calls[0]?.[0]).toContain(EMPTY_WINDOW);
    await expect(
      harness.files.read(findingPath(harness.sessionId, 'systems-analyst')),
    ).resolves.toBe(EMPTY_WINDOW);
  });

  it('rejects an undeclared git-reader call on the lead without executing it', async () => {
    const gitRead = vi.fn(async () => notableChanges());
    const slackPost = vi.fn(async () => ({ ok: true, messageTs: '1.0' }));
    const model = scopedLeadModel();
    const harness = await createFixtureHarness(model, { gitRead, slackPost });

    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });
    expect(gitRead).toHaveBeenCalledOnce();
    expect(slackPost).toHaveBeenCalledOnce();
    expect(model.leadSawUnknownGitReader).toBe(true);
  });

  it('does not post to Slack when findings are missing', async () => {
    const gitRead = vi.fn(async () => notableChanges());
    const slackPost = vi.fn(async () => ({ ok: true, messageTs: '1.0' }));
    const harness = await createFixtureHarness(delegationModel(undefined, { skipFinding: true }), {
      gitRead,
      slackPost,
    });

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'SUBAGENT_FINDING_MISSING',
    });
    expect(slackPost).not.toHaveBeenCalled();
  });

  it('does not run additional steps for a duplicate delivery', async () => {
    const gitRead = vi.fn(async () => notableChanges());
    const slackPost = vi.fn(async () => ({ ok: true, messageTs: '1.0' }));
    const model = delegationModel();
    const harness = await createFixtureHarness(model, { gitRead, slackPost });
    const sessions = new CreateSessionService(createMemoryCheckpointer());
    const command = {
      deliveryId: 'daily-2026-09-04',
      triggeredAt: LOOKBACK.until,
      message: harness.options.input,
      trigger: 'schedule' as const,
    };

    await expect(sessions.create(command)).resolves.toMatchObject({ accepted: true });
    await expect(runAgent(harness.options)).resolves.toMatchObject({ content: 'complete' });
    const callsAfterRun = model.complete.mock.calls.length;
    await expect(sessions.create(command)).resolves.toMatchObject({ accepted: false });
    expect(model.complete.mock.calls).toHaveLength(callsAfterRun);
    expect(slackPost).toHaveBeenCalledOnce();
  });

  it('stops at the configured step limit', async () => {
    const harness = await createFixtureHarness(loopingModel(), {
      gitRead: vi.fn(async () => notableChanges()),
      slackPost: vi.fn(async () => ({ ok: true, messageTs: '1.0' })),
    });

    await expect(
      runAgent({
        ...harness.options,
        limits: { ...DEFAULT_LIMITS, maxSteps: 2 },
      }),
    ).rejects.toMatchObject({ code: 'STEP_LIMIT_EXCEEDED' });
  });

  it('fails the session when Slack authentication fails', async () => {
    const slackPost = vi.fn(async () => {
      throw new WaratahError(
        'TOOL_EXECUTION_FAILED',
        'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
      );
    });
    const harness = await createFixtureHarness(delegationModel(), {
      gitRead: vi.fn(async () => notableChanges()),
      slackPost,
    });

    await expect(runAgent(harness.options)).rejects.toMatchObject({
      code: 'TOOL_EXECUTION_FAILED',
    });
    expect(slackPost).toHaveBeenCalledOnce();
  });

  it('never writes seeded secrets into traces, logs, or findings', async () => {
    const slackPost = vi.fn(async (text: string) => {
      void SEEDED_SECRET;
      void text;
      return { ok: true as const, messageTs: '1.0' };
    });
    const harness = await createFixtureHarness(delegationModel(), {
      gitRead: vi.fn(async () => notableChanges()),
      slackPost,
    });
    const sink = createJsonlSink(harness.projectRoot);

    await expect(runAgent({ ...harness.options, sink })).resolves.toMatchObject({
      content: 'complete',
    });

    const traces = await readFile(join(harness.projectRoot, '.waratah', 'traces.jsonl'), 'utf8');
    const logs = await readFile(join(harness.projectRoot, '.waratah', 'logs.jsonl'), 'utf8');
    const finding = await harness.files.read(findingPath(harness.sessionId, 'systems-analyst'));
    expect(`${traces}${logs}${finding}`).not.toContain(SEEDED_SECRET);
    expect(`${traces}${logs}`).not.toMatch(/Bearer |digest body|Complete system prompt/);
  });
});

function notableChanges() {
  return {
    repository: 'acme/app',
    branch: 'main',
    ...LOOKBACK,
    commits: [
      {
        sha: 'abc123',
        message: 'Tighten auth checks',
        author: 'dev',
        committedAt: LOOKBACK.until,
        files: [{ path: 'auth/login.ts', status: 'modified' as const }],
      },
    ],
    pullRequests: [
      {
        number: 12,
        title: 'Tighten auth',
        url: 'https://github.com/acme/app/pull/12',
        state: 'merged',
      },
    ],
  };
}

function emptyChanges() {
  return {
    repository: 'acme/app',
    branch: 'main',
    ...LOOKBACK,
    commits: [],
    pullRequests: [],
  };
}

function delegationModel(
  finding: string | undefined = FINDING,
  options: { readonly skipFinding?: boolean } = {},
) {
  return {
    complete: vi.fn(async (request: ModelCompletionRequest): Promise<ModelResult> => {
      if (isWorker(request)) {
        const toolResults = toolMessages(request);
        if (toolResults.length === 0) {
          return toolCall('git', 'git-reader', LOOKBACK);
        }
        if (options.skipFinding) {
          return { type: 'message', content: 'worker complete' };
        }
        if (toolResults.length === 1) {
          return writeFindingCall(request, finding ?? EMPTY_WINDOW);
        }
        return { type: 'message', content: 'worker complete' };
      }

      const toolResults = toolMessages(request);
      if (toolResults.length === 0) {
        return toolCall('delegate', 'task', {
          subagent: 'systems-analyst',
          instruction: `Inspect ${LOOKBACK.since} to ${LOOKBACK.until}.`,
        });
      }
      if (toolResults.length === 1) {
        const result = JSON.parse(toolResults[0] ?? '{}') as { findingPath?: string };
        return toolCall('read-finding', 'read', { path: result.findingPath });
      }
      if (toolResults.length === 2) {
        const body = JSON.parse(toolResults[1] ?? '""') as string;
        return toolCall('publish', 'slack-post', { text: body });
      }
      return { type: 'message', content: 'complete' };
    }),
  } satisfies ModelAdapter & { complete: { mock: { calls: unknown[] } } };
}

function scopedLeadModel() {
  const state = { leadSawUnknownGitReader: false };
  const adapter: ModelAdapter & { leadSawUnknownGitReader: boolean } = {
    leadSawUnknownGitReader: false,
    complete: vi.fn(async (request: ModelCompletionRequest): Promise<ModelResult> => {
      if (isWorker(request)) {
        const toolResults = toolMessages(request);
        if (toolResults.length === 0) {
          return toolCall('git', 'git-reader', LOOKBACK);
        }
        if (toolResults.length === 1) {
          return writeFindingCall(request, FINDING);
        }
        return { type: 'message', content: 'worker complete' };
      }

      const toolResults = toolMessages(request);
      if (toolResults.length === 0) {
        return toolCall('lead-git', 'git-reader', LOOKBACK);
      }
      if (toolResults.length === 1) {
        expect(JSON.parse(toolResults[0] ?? '{}')).toMatchObject({
          error: { code: 'UNKNOWN_TOOL' },
        });
        state.leadSawUnknownGitReader = true;
        adapter.leadSawUnknownGitReader = true;
        return toolCall('delegate', 'task', {
          subagent: 'systems-analyst',
          instruction: `Inspect ${LOOKBACK.since} to ${LOOKBACK.until}.`,
        });
      }
      if (toolResults.length === 2) {
        const result = JSON.parse(toolResults[1] ?? '{}') as { findingPath?: string };
        return toolCall('read-finding', 'read', { path: result.findingPath });
      }
      if (toolResults.length === 3) {
        const body = JSON.parse(toolResults[2] ?? '""') as string;
        return toolCall('publish', 'slack-post', { text: body });
      }
      return { type: 'message', content: 'complete' };
    }),
  };
  return adapter;
}

function loopingModel(): ModelAdapter {
  return {
    complete: vi.fn(async () => toolCall('loop', 'task', {
      subagent: 'systems-analyst',
      instruction: 'Loop.',
    })),
  };
}

function toolCall(id: string, name: string, arguments_: Record<string, unknown>): ModelResult {
  return { type: 'tool_calls', toolCalls: [{ id, name, arguments: arguments_ }] };
}

function writeFindingCall(request: ModelCompletionRequest, content: string): ModelResult {
  const message = request.messages.find(
    (entry) => entry.role === 'system' && entry.content.includes('required final finding'),
  );
  const match = message?.content.match(/(\/session\/\S+\/findings\/\S+\.md)/);
  if (match?.[1] === undefined) {
    throw new Error('Missing required finding path');
  }
  return toolCall('write-finding', 'write', { path: match[1], content });
}

function isWorker(request: ModelCompletionRequest): boolean {
  return request.messages.some(
    (message) => message.role === 'system' && message.content.includes('required final finding'),
  );
}

function toolMessages(request: ModelCompletionRequest): string[] {
  return request.messages
    .filter((message) => message.role === 'tool')
    .map((message) => message.content);
}

async function createFixtureHarness(
  model: ModelAdapter,
  adapters: {
    readonly gitRead: () => Promise<ReturnType<typeof notableChanges>>;
    readonly slackPost: (text: string) => Promise<{ ok: boolean; messageTs?: string }>;
  },
) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-daily-changes-'));
  directories.push(projectRoot);
  await cp(join(fixtureRoot, 'agent'), join(projectRoot, 'agent'), { recursive: true });
  await cp(join(fixtureRoot, 'AGENTS.md'), join(projectRoot, 'AGENTS.md'));

  const worker = createAgent({
    name: 'systems-analyst',
    kind: 'subagent',
    model: 'fixture-model',
    instructions: ['./instructions.md'],
    tools: [
      createGitReaderTool({
        repository: 'acme/app',
        branch: 'main',
        read: async (input) => {
          const changes = await adapters.gitRead();
          return { ...changes, since: input.since, until: input.until };
        },
      }),
    ],
    subagents: [],
    channels: [],
  });
  const lead = createAgent({
    name: 'daily-changes',
    model: 'fixture-model',
    instructions: ['./instructions.md'],
    tools: [
      createSlackPostTool({
        channel: 'C-fixture',
        post: async (text) => adapters.slackPost(text),
      }),
    ],
    subagents: [worker],
    channels: [],
  });
  const sessionId = asSessionId(`session-${directories.length}`);
  const files: SessionFilesystem = new ConfinedSessionFilesystem(
    sessionId,
    new InMemorySessionBackend(),
  );

  return {
    projectRoot,
    sessionId,
    files,
    options: {
      agent: lead,
      agentFile: join(projectRoot, 'agent', 'agent.ts'),
      projectRoot,
      sessionId,
      turnId: createTurnId(),
      files,
      modelAdapter: model,
      input: `Create the daily digest from ${LOOKBACK.since} to ${LOOKBACK.until}.`,
    },
  };
}
