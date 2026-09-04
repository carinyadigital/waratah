import type { StepBudget } from '../harness/compile-graph.js';
import type { HarnessLimits } from '../harness/limits.js';
import type { ModelAdapter } from '../harness/model-adapter.js';
import { runAgent } from '../harness/run-agent.js';
import type { AgentDefinition, SessionFilesystem, TaskToolResult } from '../shared/contracts.js';
import { findingPath } from '../shared/contracts.js';
import { WaratahError, isWaratahError } from '../shared/errors.js';
import type { SessionId, SessionPath, TurnId } from '../shared/ids.js';
import type { ToolExecutorOptions } from '../tools/executor.js';

const MAX_FINDING_SUMMARY_BYTES = 1_024;

export interface RunSubagentOptions {
  readonly agent: AgentDefinition;
  readonly agentFile: string;
  readonly projectRoot: string;
  readonly instruction: string;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly files: SessionFilesystem;
  readonly modelAdapter: ModelAdapter;
  readonly parentSignal: AbortSignal;
  readonly budget: StepBudget;
  readonly limits: HarnessLimits;
  readonly toolExecutor?: ToolExecutorOptions;
}

export async function runSubagent(options: RunSubagentOptions): Promise<TaskToolResult> {
  const canonicalPath = findingPath(options.sessionId, options.agent.name);
  try {
    await options.files.write(canonicalPath, '');
    await runAgent({
      agent: options.agent,
      agentFile: options.agentFile,
      projectRoot: options.projectRoot,
      sessionId: options.sessionId,
      turnId: options.turnId,
      files: options.files,
      modelAdapter: options.modelAdapter,
      input: options.instruction,
      findingPath: canonicalPath,
      budget: options.budget,
      limits: options.limits,
      signal: options.parentSignal,
      toolExecutor: options.toolExecutor,
    });

    const finding = await readFinding(options.files, canonicalPath);
    if (Buffer.byteLength(finding, 'utf8') > options.limits.maxFindingBytes) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }

    return {
      subagent: options.agent.name,
      findingPath: canonicalPath,
      summary: summarizeFinding(finding),
    };
  } catch (error) {
    throw isWaratahError(error)
      ? error
      : new WaratahError(
          'TOOL_EXECUTION_FAILED',
          'The tool could not complete. Check the tool configuration and retry only when the operation is safe.',
        );
  }
}

async function readFinding(files: SessionFilesystem, path: SessionPath) {
  const directory = path.slice(0, path.lastIndexOf('/')) as SessionPath;
  const entries = await files.list(directory);
  if (!entries.some((entry) => entry.path === path && entry.kind === 'file')) {
    throw findingMissing();
  }
  const finding = await files.read(path);
  if (finding.trim() === '') {
    throw findingMissing();
  }
  return finding;
}

function summarizeFinding(finding: string): string {
  const firstLine = finding
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (firstLine === undefined) {
    throw findingMissing();
  }

  let summary = '';
  let bytes = 0;
  for (const character of firstLine) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > MAX_FINDING_SUMMARY_BYTES) {
      break;
    }
    summary += character;
    bytes += characterBytes;
  }
  return summary;
}

function findingMissing(): WaratahError {
  return new WaratahError(
    'SUBAGENT_FINDING_MISSING',
    'The subagent did not write a required findings file. Write the canonical findings path before completing.',
  );
}
