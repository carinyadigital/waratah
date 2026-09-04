import { describe, expect, it } from 'vitest';

import type { ScheduleTick } from '../shared/contracts.js';
import { createMemoryCheckpointer } from '../session/checkpointer.js';
import { CreateSessionService, triggerInstant } from '../session/create-session.js';
import {
  SCHEDULE_ADAPTER,
  SCHEDULE_ADAPTER_KIND,
  defineSchedule,
  dispatchSchedule,
} from './schedule.js';

const schedule = defineSchedule({
  cron: '0 8 * * *',
  markdown: 'Analyze repository changes for the last 24 elapsed hours.',
});

describe('defineSchedule', () => {
  it('returns the authored cron expression and markdown prompt', () => {
    expect(schedule).toEqual({
      cron: '0 8 * * *',
      markdown: 'Analyze repository changes for the last 24 elapsed hours.',
    });
    expect(SCHEDULE_ADAPTER).toEqual({ kind: SCHEDULE_ADAPTER_KIND });
  });

  it.each([
    ['missing cron', { markdown: 'Run.' }],
    ['blank cron', { cron: ' ', markdown: 'Run.' }],
    ['missing markdown', { cron: '0 8 * * *' }],
    ['blank markdown', { cron: '0 8 * * *', markdown: ' ' }],
    ['null definition', null],
  ])('rejects %s', (_label, definition) => {
    expect(() => defineSchedule(definition as never)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_AGENT',
        message: expect.stringContaining('cron expression and a markdown prompt'),
      }),
    );
  });
});

describe('dispatchSchedule', () => {
  it('opens a unique session from the markdown prompt', async () => {
    const sessions = new CreateSessionService(createMemoryCheckpointer());
    const tick = scheduleTick('2026-03-29T14:00:00+11:00');

    const first = await dispatchSchedule(sessions, schedule, tick);
    const second = await dispatchSchedule(sessions, schedule, tick);

    expect(first.accepted).toBe(true);
    expect(second).toEqual({
      sessionId: first.sessionId,
      accepted: false,
      duplicateOf: first.sessionId,
    });
  });

  it.each([
    ['missing schedule id', { scheduleId: '', deliveryId: 'daily-changes:tick', triggeredAt: '2026-09-04T00:00:00Z' }],
    ['missing delivery id', { scheduleId: 'daily-changes', deliveryId: '', triggeredAt: '2026-09-04T00:00:00Z' }],
  ])('rejects %s before creating a session', async (_label, tick) => {
    const sessions = new CreateSessionService(createMemoryCheckpointer());

    await expect(dispatchSchedule(sessions, schedule, tick)).rejects.toMatchObject({
      name: 'InvalidSessionRequest',
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

function scheduleTick(triggeredAt: string): ScheduleTick {
  return {
    scheduleId: 'daily-changes',
    deliveryId: `daily-changes:${triggeredAt}`,
    triggeredAt,
  };
}
