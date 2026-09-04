import { WaratahError } from '../shared/errors.js';
import type {
  CreateSessionResult,
  ScheduleDefinition,
  ScheduleTick,
} from '../shared/contracts.js';
import { InvalidSessionRequest, CreateSessionService, triggerInstant } from '../session/create-session.js';

/**
 * Durable adapter kind used when a schedule fires without targeting a
 * channel. Framework-owned — authored code never constructs it.
 */
export const SCHEDULE_ADAPTER_KIND = 'schedule';

export const SCHEDULE_ADAPTER = {
  kind: SCHEDULE_ADAPTER_KIND,
} as const;

/**
 * Defines a schedule in TypeScript. Export as the default from a file
 * under the lead's schedules directory. The schedule name comes from
 * that file path.
 */
export function defineSchedule(definition: ScheduleDefinition): ScheduleDefinition {
  if (!isRecord(definition)) {
    throw invalidSchedule();
  }

  assertNonEmptyString(definition.cron);
  assertNonEmptyString(definition.markdown);
  return definition;
}

/** Dispatches a schedule tick into a durable session using the markdown prompt. */
export async function dispatchSchedule(
  sessions: CreateSessionService,
  schedule: ScheduleDefinition,
  tick: ScheduleTick,
): Promise<CreateSessionResult> {
  assertNonEmpty(tick.scheduleId);
  assertNonEmpty(tick.deliveryId);
  triggerInstant(tick.triggeredAt);
  return sessions.create({
    deliveryId: tick.deliveryId,
    trigger: 'schedule',
    triggeredAt: tick.triggeredAt,
    message: schedule.markdown,
  });
}

function assertNonEmpty(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSessionRequest();
  }
}

function assertNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidSchedule();
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidSchedule(): WaratahError {
  return new WaratahError(
    'INVALID_AGENT',
    'The schedule definition is invalid. Provide a non-empty cron expression and a markdown prompt.',
  );
}
