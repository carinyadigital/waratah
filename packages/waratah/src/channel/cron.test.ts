import { describe, expect, it } from 'vitest';

import type { CronTick } from '../shared/contracts.js';
import { createMemoryCheckpointer } from '../session/checkpointer.js';
import { CreateSessionService, triggerInstant } from '../session/create-session.js';
import { createCronChannel, defineCronChannel, normalizeCronTick } from './cron.js';

const target = {
  repository: 'acme/app',
  branch: 'main',
} as const;

describe('cron lookback normalization', () => {
  it('uses the exact trigger string as until and subtracts 24 elapsed hours', () => {
    const triggeredAt = '2026-03-29T14:00:00+11:00';

    const input = normalizeCronTick(tick(triggeredAt), target);

    expect(input).toEqual({
      since: '2026-03-28T03:00:00.000Z',
      until: triggeredAt,
      ...target,
    });
    expect(Date.parse(input.until) - Date.parse(input.since)).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps a 24-hour elapsed window across Sydney autumn clock rollback', () => {
    const input = normalizeCronTick(tick('2026-04-05T14:00:00+10:00'), target);

    expect(input.since).toBe('2026-04-04T04:00:00.000Z');
    expect(sydneyHour(input.since)).toBe('15');
    expect(sydneyHour(input.until)).toBe('14');
    expect(Date.parse(input.until) - Date.parse(input.since)).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps a 24-hour elapsed window across Sydney spring clock advance', () => {
    const input = normalizeCronTick(tick('2026-10-04T14:00:00+11:00'), target);

    expect(input.since).toBe('2026-10-03T03:00:00.000Z');
    expect(sydneyHour(input.since)).toBe('13');
    expect(sydneyHour(input.until)).toBe('14');
    expect(Date.parse(input.until) - Date.parse(input.since)).toBe(24 * 60 * 60 * 1000);
  });

  it('dispatches a unique tick through the shared session service', async () => {
    const sessions = new CreateSessionService(createMemoryCheckpointer());
    const channel = createCronChannel({ ...target, sessions });
    const cronTick = tick('2026-03-29T14:00:00+11:00');

    const first = await channel.dispatch(cronTick);
    const second = await channel.dispatch(cronTick);

    expect(first.accepted).toBe(true);
    expect(second).toEqual({
      sessionId: first.sessionId,
      accepted: false,
      duplicateOf: first.sessionId,
    });
    expect(defineCronChannel()).toEqual({
      name: 'cron',
      description: 'Daily schedule trigger for the lookback window.',
    });
  });

  it.each([
    ['UTC designator', '2026-09-04T00:00:00Z'],
    ['positive offset', '2026-09-04T14:00:00+10:00'],
    ['negative offset', '2026-09-04T08:00:00-04:00'],
  ])('accepts %s: %s', (_policy, triggeredAt) => {
    expect(Number.isFinite(triggerInstant(triggeredAt))).toBe(true);
  });

  it.each([
    ['missing value', undefined],
    ['arbitrary text', 'not-a-timestamp'],
    ['rollover date', '2026-02-30T14:00:00+11:00'],
    ['missing offset', '2026-09-04T00:00:00'],
  ])('rejects %s: %s', (_policy, triggeredAt) => {
    expect(() => triggerInstant(triggeredAt)).toThrowError(
      expect.objectContaining({ name: 'InvalidSessionRequest' }),
    );
  });
});

function tick(triggeredAt: string): CronTick {
  return {
    scheduleId: 'daily-changes',
    deliveryId: `daily-changes:${triggeredAt}`,
    triggeredAt,
  };
}

function sydneyHour(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  return parts.find((part) => part.type === 'hour')?.value ?? '';
}
