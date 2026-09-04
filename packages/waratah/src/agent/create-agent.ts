import type {
  AgentDefinition,
  CreateAgentInput,
  Schema,
  ToolDefinition,
} from '../shared/contracts.js';
import { WaratahError } from '../shared/errors.js';

const DEFAULT_SKILLS = ['./skills/'] as const;
const DEFAULT_MEMORY = ['.waratah/memory/'] as const;

/**
 * Creates a normalized agent definition for the compiler.
 *
 * The model, tools, channels, and subagents must be declared explicitly.
 * Omitting `skills` discovers skills from `./skills/`, while omitting `memory`
 * uses the project `.waratah/memory/` directory. Passing an empty array for
 * either option disables that source instead of applying its default.
 * Omitting `schedules` means none; list imported `defineSchedule` values
 * when the lead runs on a cadence.
 */
export function createAgent(input: CreateAgentInput): AgentDefinition {
  if (!isRecord(input)) {
    throw invalidAgent();
  }

  assertNonEmptyString(input.name);
  assertAgentKind(input.kind);
  assertNonEmptyString(input.model);
  assertStringArray(input.instructions, false);
  assertStringArray(input.skills, true);
  assertStringArray(input.memory, true);
  assertArray(input.tools);
  assertArray(input.subagents);
  assertArray(input.channels);
  assertArray(input.schedules, true);

  return {
    ...input,
    kind: input.kind ?? 'lead',
    skills: input.skills ?? DEFAULT_SKILLS,
    memory: input.memory ?? DEFAULT_MEMORY,
    schedules: input.schedules ?? [],
  };
}

/**
 * Defines a named tool with a waratah-owned schema and typed executor.
 *
 * Tools become available only when listed explicitly on an agent definition;
 * placing a tool file beside an agent does not grant that capability.
 */
export function defineTool<TInput, TOutput>(input: {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema<TInput>;
  readonly execute: ToolDefinition<TInput, TOutput>['execute'];
}): ToolDefinition {
  if (!isRecord(input)) {
    throw invalidAgent();
  }

  assertNonEmptyString(input.name);
  assertNonEmptyString(input.description);

  if (!isRecord(input.inputSchema) || typeof input.inputSchema.parse !== 'function') {
    throw invalidAgent();
  }

  if (typeof input.execute !== 'function') {
    throw invalidAgent();
  }

  // Authored tools are stored as ToolDefinition (unknown in/out) on AgentDefinition.
  return input as unknown as ToolDefinition;
}

function assertAgentKind(kind: unknown): asserts kind is CreateAgentInput['kind'] {
  if (kind !== undefined && kind !== 'lead' && kind !== 'subagent') {
    throw invalidAgent();
  }
}

function assertNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidAgent();
  }
}

function assertStringArray(
  value: unknown,
  optional: boolean,
): asserts value is readonly string[] | undefined {
  if (optional && value === undefined) {
    return;
  }

  assertArray(value);

  for (const entry of value) {
    assertNonEmptyString(entry);
  }
}

function assertArray(value: unknown, optional = false): asserts value is readonly unknown[] {
  if (optional && value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw invalidAgent();
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidAgent(): WaratahError {
  return new WaratahError(
    'INVALID_AGENT',
    'The agent definition is invalid. Correct the reported definition fields and try again.',
  );
}
