import { describe, expect, it } from 'vitest';

import { PHASE_1_LIMITS } from '../harness/limits.js';
import { createMemoryCheckpointer } from '../session/checkpointer.js';
import { CreateSessionService } from '../session/create-session.js';
import { postSession } from './post-session.js';
import { createWaratahServer } from './server.js';

const validTimestamp = '2026-09-04T00:00:00.000Z';

describe('POST /session', () => {
  it('returns 202 accepted then duplicate for the same deliveryId', async () => {
    const sessions = new CreateSessionService(createMemoryCheckpointer());
    const body = {
      deliveryId: 'delivery-one',
      triggeredAt: validTimestamp,
      message: 'Create the daily digest.',
    };

    const accepted = await postSession({ sessions }, body);
    const duplicate = await postSession({ sessions }, body);

    expect(accepted).toEqual({
      statusCode: 202,
      body: { status: 'accepted', sessionId: 'delivery-one' },
    });
    expect(duplicate).toEqual({
      statusCode: 202,
      body: {
        status: 'duplicate',
        sessionId: 'delivery-one',
        duplicateOf: 'delivery-one',
      },
    });
  });

  it.each([
    ['malformed timestamp', { deliveryId: 'd', triggeredAt: 'not-a-timestamp', message: 'Run.' }],
    ['absent delivery ID', { triggeredAt: validTimestamp, message: 'Run.' }],
    [
      'unknown metadata field',
      {
        deliveryId: 'd',
        triggeredAt: validTimestamp,
        message: 'Run.',
        metadata: { unexpected: 'value' },
      },
    ],
  ])('returns 400 for %s', async (_label, body) => {
    const result = await postSession(
      { sessions: new CreateSessionService(createMemoryCheckpointer()) },
      body,
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'The session request is invalid.' },
    });
  });

  it('returns 400 for an oversized message', async () => {
    const result = await postSession(
      { sessions: new CreateSessionService(createMemoryCheckpointer()) },
      {
        deliveryId: 'oversized',
        triggeredAt: validTimestamp,
        message: 'x'.repeat(PHASE_1_LIMITS.maxSessionMessageBytes + 1),
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      error: {
        code: 'PAYLOAD_LIMIT_EXCEEDED',
        message: 'The session request exceeds the allowed size.',
      },
    });
  });
});

describe('waratah HTTP server', () => {
  it('accepts POST /session on loopback and shuts down', async () => {
    const server = createWaratahServer({
      sessions: new CreateSessionService(createMemoryCheckpointer()),
    });
    const address = await server.listen(0);

    try {
      const response = await fetch(`http://${address.host}:${address.port}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deliveryId: 'http-delivery',
          triggeredAt: validTimestamp,
          message: 'Create the daily digest.',
        }),
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        status: 'accepted',
        sessionId: 'http-delivery',
      });
    } finally {
      await server.close();
    }
  });
});
