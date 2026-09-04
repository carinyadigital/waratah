import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { asSessionId, asStepId, asTurnId } from '../shared/ids.js';
import { createJsonlSink, createToolTraceHook } from './jsonl-sink.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('createJsonlSink', () => {
  it('writes allowlisted events and never persists seeded secrets', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-traces-'));
    directories.push(projectRoot);
    const sink = createJsonlSink(projectRoot);

    await sink.writeTrace({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
      authorization: 'Bearer seeded-header-token',
      prompt: 'Do not persist this prompt',
      body: 'Posted Slack digest body',
      diff: '--- a/secret\n+++ b/secret',
      token: 'ghp_seededgithubtoken',
    });
    await sink.writeLog({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
      slackMessageId: 'xoxb-seeded-slack-token',
    });

    const traces = await readFile(join(projectRoot, '.waratah', 'traces.jsonl'), 'utf8');
    const logs = await readFile(join(projectRoot, '.waratah', 'logs.jsonl'), 'utf8');

    expect(JSON.parse(traces)).toEqual({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
    });
    expect(JSON.parse(logs)).toEqual({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'session.terminal',
      kind: 'session',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
    });
    expect(`${traces}${logs}`).not.toMatch(
      /Bearer|seeded-header-token|prompt|digest body|secret|ghp_|xoxb-/,
    );
  });

  it('records secret-safe tool start and terminal metadata', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'waratah-traces-'));
    directories.push(projectRoot);
    const sink = createJsonlSink(projectRoot);
    const trace = createToolTraceHook(sink);
    const metadata = {
      callId: 'call-1',
      sessionId: asSessionId('session-one'),
      turnId: asTurnId('turn-one'),
      stepId: asStepId('step-one'),
      agentName: 'lead',
      toolName: 'slack-post',
    };

    await Promise.resolve(trace.started(metadata));
    await Promise.resolve(trace.finished({ ...metadata, status: 'succeeded' }));

    const traces = await readFile(join(projectRoot, '.waratah', 'traces.jsonl'), 'utf8');
    const events = traces
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { name: string; toolName: string; status: string });

    expect(events.map((event) => event.name)).toEqual(['tool.start', 'tool.terminal']);
    expect(events[0]).toMatchObject({ toolName: 'slack-post', status: 'started' });
    expect(events[1]).toMatchObject({ toolName: 'slack-post', status: 'succeeded' });
    expect(traces).not.toMatch(/arguments|input|output|body|prompt/);
  });
});
