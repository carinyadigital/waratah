import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ToolTraceHook } from '../tools/executor.js';
import { sanitizeTraceEvent, type TraceEvent } from './events.js';

export interface JsonlSink {
  writeTrace(event: unknown): Promise<void>;
  writeLog(event: unknown): Promise<void>;
}

/** Appends allowlisted events to `.waratah/traces.jsonl` and `.waratah/logs.jsonl`. */
export function createJsonlSink(projectRoot: string): JsonlSink {
  const directory = join(projectRoot, '.waratah');
  return {
    writeTrace: (event) => appendEvent(directory, 'traces.jsonl', event),
    writeLog: (event) => appendEvent(directory, 'logs.jsonl', event),
  };
}

export function createToolTraceHook(sink: JsonlSink): ToolTraceHook {
  const startedAt = new Map<string, number>();
  return {
    started(metadata) {
      startedAt.set(metadata.callId, Date.now());
      return sink.writeTrace({
        timestamp: new Date().toISOString(),
        name: 'tool.start',
        kind: 'tool',
        phase: 'start',
        status: 'started',
        sessionId: metadata.sessionId,
        turnId: metadata.turnId,
        stepId: metadata.stepId,
        agentName: metadata.agentName,
        toolName: metadata.toolName,
      } satisfies TraceEvent);
    },
    finished(metadata) {
      const started = startedAt.get(metadata.callId);
      startedAt.delete(metadata.callId);
      return sink.writeTrace({
        timestamp: new Date().toISOString(),
        name: 'tool.terminal',
        kind: 'tool',
        phase: 'terminal',
        status: metadata.status,
        durationMs: started === undefined ? undefined : Date.now() - started,
        sessionId: metadata.sessionId,
        turnId: metadata.turnId,
        stepId: metadata.stepId,
        agentName: metadata.agentName,
        toolName: metadata.toolName,
        errorCode: metadata.status === 'failed' ? metadata.errorCode : undefined,
      } satisfies TraceEvent);
    },
  };
}

async function appendEvent(directory: string, fileName: string, event: unknown): Promise<void> {
  const sanitized = sanitizeTraceEvent(event);
  if (sanitized === undefined) {
    return;
  }
  await mkdir(directory, { recursive: true });
  await appendFile(join(directory, fileName), `${JSON.stringify(sanitized)}\n`, 'utf8');
}
