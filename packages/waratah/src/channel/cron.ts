import type { CreateSessionResult, CronTick, DailyChangesInput } from '../shared/contracts.js';
import { InvalidSessionRequest, CreateSessionService, triggerInstant } from '../session/create-session.js';

const LOOKBACK_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface CronChannelOptions {
  readonly repository: string;
  readonly branch: string;
  readonly sessions: CreateSessionService;
}

export interface CronChannel {
  readonly name: 'cron';
  normalize(tick: CronTick): DailyChangesInput;
  dispatch(tick: CronTick): Promise<CreateSessionResult>;
}

/** Defines the cron channel for explicit lead-agent wiring. */
export function defineCronChannel(): {
  readonly name: 'cron';
  readonly description: string;
} {
  return { name: 'cron', description: 'Daily schedule trigger for the lookback window.' };
}

/** Creates the framework cron channel that durably accepts normalized ticks. */
export function createCronChannel(options: CronChannelOptions): CronChannel {
  assertNonEmpty(options.repository);
  assertNonEmpty(options.branch);

  const normalize = (tick: CronTick): DailyChangesInput =>
    normalizeCronTick(tick, {
      repository: options.repository,
      branch: options.branch,
    });

  return {
    name: 'cron',
    normalize,
    async dispatch(tick) {
      assertNonEmpty(tick.scheduleId);
      assertNonEmpty(tick.deliveryId);
      const input = normalize(tick);
      return options.sessions.create({
        deliveryId: tick.deliveryId,
        trigger: 'cron',
        triggeredAt: tick.triggeredAt,
        message: cronInstruction(input),
      });
    },
  };
}

/** Converts a cron tick into an immutable elapsed-time lookback window. */
export function normalizeCronTick(
  tick: CronTick,
  target: Pick<DailyChangesInput, 'repository' | 'branch'>,
): DailyChangesInput {
  const untilInstant = triggerInstant(tick.triggeredAt);
  return {
    since: new Date(untilInstant - LOOKBACK_MILLISECONDS).toISOString(),
    until: tick.triggeredAt,
    repository: target.repository,
    branch: target.branch,
  };
}

function cronInstruction(input: DailyChangesInput): string {
  return `Analyze repository changes for this immutable lookback window:\n${JSON.stringify(input)}`;
}

function assertNonEmpty(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSessionRequest();
  }
}
