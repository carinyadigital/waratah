import { describe, expect, it, vi } from 'vitest';

import type { CreateAgentInput, Schema } from '../shared/contracts.js';
import { createAgent, defineTool } from './create-agent.js';

const stringSchema: Schema<string> = {
  parse(input) {
    if (typeof input !== 'string') {
      throw new TypeError('Expected a string');
    }

    return input;
  },
};

const baseAgent = (): CreateAgentInput => ({
  name: 'daily-changes',
  model: 'test-model',
  instructions: ['./instructions.md'],
  tools: [],
  subagents: [],
  channels: [],
});

describe('createAgent', () => {
  it('applies the lead, skills, and memory defaults when omitted', () => {
    const definition = createAgent(baseAgent());

    expect(definition).toEqual({
      ...baseAgent(),
      kind: 'lead',
      skills: ['./skills/'],
      memory: ['.waratah/memory/'],
    });
  });

  it('preserves empty skills and memory arrays to disable both sources', () => {
    const definition = createAgent({
      ...baseAgent(),
      skills: [],
      memory: [],
    });

    expect(definition.skills).toEqual([]);
    expect(definition.memory).toEqual([]);
  });

  it('preserves explicitly declared wiring', () => {
    const tool = defineTool({
      name: 'slack-post',
      description: 'Posts the completed digest.',
      inputSchema: stringSchema,
      execute: async (input) => input.length,
    });
    const subagent = createAgent({
      ...baseAgent(),
      name: 'systems-analyst',
      kind: 'subagent',
    });
    const channel = { name: 'cron', description: 'Daily schedule trigger.' };

    const definition = createAgent({
      ...baseAgent(),
      kind: 'lead',
      skills: ['../shared/skills/'],
      memory: ['./notes/MEMORY.md'],
      tools: [tool],
      subagents: [subagent],
      channels: [channel],
    });

    expect(definition).toMatchObject({
      kind: 'lead',
      skills: ['../shared/skills/'],
      memory: ['./notes/MEMORY.md'],
      tools: [tool],
      subagents: [subagent],
      channels: [channel],
    });
  });

  it.each([
    ['missing name', { ...baseAgent(), name: '' }],
    ['invalid kind', { ...baseAgent(), kind: 'worker' }],
    ['missing model', { ...baseAgent(), model: ' ' }],
    ['missing instructions', { ...baseAgent(), instructions: undefined }],
    ['invalid skill path', { ...baseAgent(), skills: [''] }],
    ['invalid memory path', { ...baseAgent(), memory: [42] }],
    ['missing tools', { ...baseAgent(), tools: undefined }],
    ['missing subagents', { ...baseAgent(), subagents: undefined }],
    ['missing channels', { ...baseAgent(), channels: undefined }],
  ])('rejects an invalid definition with %s', (_case, input) => {
    expect(() => createAgent(input as CreateAgentInput)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AGENT' }),
    );
  });

  it('leaves channel-scope validation to compilation', () => {
    const definition = createAgent({
      ...baseAgent(),
      kind: 'subagent',
      channels: [{ name: 'cron', description: 'Must be rejected at compile time.' }],
    });

    expect(definition.channels).toEqual([
      { name: 'cron', description: 'Must be rejected at compile time.' },
    ]);
  });
});

describe('defineTool', () => {
  it('returns the explicitly named typed tool', async () => {
    const execute = vi.fn(async (input: string) => input.length);
    const tool = defineTool({
      name: 'text-length',
      description: 'Returns the input length.',
      inputSchema: stringSchema,
      execute,
    });

    expect(tool.name).toBe('text-length');
    expect(tool.description).toBe('Returns the input length.');
    expect(tool.inputSchema.parse('hello')).toBe('hello');
    await expect(tool.execute('hello', {} as never)).resolves.toBe(5);
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'missing name',
      { name: '', description: 'Valid', inputSchema: stringSchema, execute: vi.fn() },
    ],
    [
      'missing description',
      { name: 'valid', description: ' ', inputSchema: stringSchema, execute: vi.fn() },
    ],
    ['invalid schema', { name: 'valid', description: 'Valid', inputSchema: {}, execute: vi.fn() }],
    [
      'invalid executor',
      { name: 'valid', description: 'Valid', inputSchema: stringSchema, execute: undefined },
    ],
  ])('rejects a tool with %s', (_case, input) => {
    expect(() => defineTool(input as never)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AGENT' }),
    );
  });
});
