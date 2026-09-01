import { describe, expect, it } from 'vitest';

import { findingPath, threadIdFor } from '../../src/shared/contracts.js';
import { asSessionId } from '../../src/shared/ids.js';

describe('contracts', () => {
  it('maps delivery ids to stable thread ids', () => {
    const deliveryId = 'cron-2026-09-01T08:00:00Z';

    expect(threadIdFor(deliveryId)).toBe(deliveryId);
    expect(threadIdFor(deliveryId)).toBe(threadIdFor(deliveryId));
  });

  it('builds canonical finding paths for a subagent', () => {
    const sessionId = asSessionId('sess-123');

    expect(findingPath(sessionId, 'systems-analyst')).toBe(
      '/session/sess-123/findings/systems-analyst.md',
    );
  });
});
