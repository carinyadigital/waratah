import { describe, expect, it } from 'vitest';

import { sanitizeTraceEvent } from './events.js';

describe('sanitizeTraceEvent', () => {
  it('keeps allowlisted fields and drops payloads, prompts, and headers', () => {
    const event = sanitizeTraceEvent({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'tool.terminal',
      kind: 'tool',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
      toolName: 'slack-post',
      prompt: 'Complete system prompt',
      messages: [{ role: 'user', content: 'secret' }],
      authorization: 'Bearer leaked-header',
      body: 'Slack digest body',
      diff: 'raw git diff',
      input: { token: 'xoxb-not-for-traces' },
      output: { text: 'posted' },
    });

    expect(event).toEqual({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'tool.terminal',
      kind: 'tool',
      phase: 'terminal',
      status: 'succeeded',
      sessionId: 'session-one',
      toolName: 'slack-post',
    });
    expect(JSON.stringify(event)).not.toMatch(/prompt|Bearer|digest body|raw git diff|xoxb/);
  });

  it('drops allowlisted strings that look like secrets', () => {
    const event = sanitizeTraceEvent({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'tool.terminal',
      slackMessageId: 'xoxb-1234567890-secret',
      pullRequestUrl: 'https://github.com/acme/app/pull/12',
    });

    expect(event).toEqual({
      timestamp: '2026-09-04T00:00:00.000Z',
      name: 'tool.terminal',
      pullRequestUrl: 'https://github.com/acme/app/pull/12',
    });
  });
});
