import type { CreateSessionCommand, CreateSessionResult } from '../shared/contracts.js';
import { PHASE_1_LIMITS } from '../harness/limits.js';
import { WaratahError } from '../shared/errors.js';
import { asSessionId } from '../shared/ids.js';
import { getThread, type Checkpointer } from './checkpointer.js';
import { threadIdFor } from './thread-id.js';

export class InvalidSessionRequest extends Error {
  constructor() {
    super('The session request is invalid. Correct the trigger or session request and try again.');
    this.name = 'InvalidSessionRequest';
  }
}

export interface CreateSessionServiceOptions {
  readonly metadataKeys?: readonly string[];
  readonly limits?: { readonly maxSessionMessageBytes?: number };
}

/** Validates trigger input before accepting a session against the checkpointer. */
export class CreateSessionService {
  readonly #checkpointer: Checkpointer;
  readonly #metadataKeys: ReadonlySet<string>;
  readonly #maxMessageBytes: number;

  constructor(checkpointer: Checkpointer, options: CreateSessionServiceOptions = {}) {
    this.#checkpointer = checkpointer;
    this.#metadataKeys = new Set(options.metadataKeys);
    this.#maxMessageBytes = Math.min(
      options.limits?.maxSessionMessageBytes ?? PHASE_1_LIMITS.maxSessionMessageBytes,
      PHASE_1_LIMITS.maxSessionMessageBytes,
    );
  }

  async create(command: unknown): Promise<CreateSessionResult> {
    assertCreateSessionCommand(command, this.#metadataKeys, this.#maxMessageBytes);
    const threadId = threadIdFor(command.deliveryId);
    const existing = await getThread(this.#checkpointer, threadId);
    const sessionId = asSessionId(threadId);
    if (existing !== undefined) {
      return { sessionId, accepted: false, duplicateOf: sessionId };
    }
    return { sessionId, accepted: true };
  }
}

export function triggerInstant(triggeredAt: unknown): number {
  if (typeof triggeredAt !== 'string') {
    throw new InvalidSessionRequest();
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      triggeredAt,
    );
  if (match === null) {
    throw new InvalidSessionRequest();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  const daysInMonth =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    throw new InvalidSessionRequest();
  }

  const instant = Date.parse(triggeredAt);
  if (!Number.isFinite(instant)) {
    throw new InvalidSessionRequest();
  }
  return instant;
}

function assertCreateSessionCommand(
  command: unknown,
  metadataKeys: ReadonlySet<string>,
  maxMessageBytes: number,
): asserts command is CreateSessionCommand {
  if (!isRecord(command)) {
    throw new InvalidSessionRequest();
  }

  assertNonEmptyString(command.deliveryId);
  if (command.trigger !== 'manual' && command.trigger !== 'cron' && command.trigger !== 'http') {
    throw new InvalidSessionRequest();
  }
  triggerInstant(command.triggeredAt);
  assertNonEmptyString(command.message);
  if (Buffer.byteLength(command.message, 'utf8') > maxMessageBytes) {
    throw new WaratahError(
      'PAYLOAD_LIMIT_EXCEEDED',
      'The payload exceeds the allowed size. Reduce the payload and try again.',
    );
  }

  if (command.metadata !== undefined) {
    if (!isRecord(command.metadata) || Array.isArray(command.metadata)) {
      throw new InvalidSessionRequest();
    }
    for (const [key, value] of Object.entries(command.metadata)) {
      if (!metadataKeys.has(key) || typeof value !== 'string') {
        throw new InvalidSessionRequest();
      }
    }
  }
}

function assertNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSessionRequest();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
