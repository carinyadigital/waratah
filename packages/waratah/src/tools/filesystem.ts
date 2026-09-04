import { defineTool } from '../agent/create-agent.js';
import type { Schema } from '../shared/contracts.js';
import type { SessionPath } from '../shared/ids.js';
import { BUILTIN_TOOL_NAMES } from './builtin-names.js';

interface PathInput {
  readonly path: SessionPath;
}

interface WriteInput extends PathInput {
  readonly content: string;
}

const pathSchema: Schema<PathInput> = {
  parse(input) {
    const value = asRecord(input);
    if (typeof value.path !== 'string') {
      throw new TypeError('Expected path to be a string');
    }

    return { path: value.path as SessionPath };
  },
};

const writeSchema: Schema<WriteInput> = {
  parse(input) {
    const value = asRecord(input);
    if (typeof value.path !== 'string' || typeof value.content !== 'string') {
      throw new TypeError('Expected path and content to be strings');
    }

    return {
      path: value.path as SessionPath,
      content: value.content,
    };
  },
};

export const readTool = defineTool({
  name: BUILTIN_TOOL_NAMES.READ,
  description: 'Read a UTF-8 file from the active session.',
  inputSchema: pathSchema,
  execute: async ({ path }, context) => context.files.read(path),
});

export const writeTool = defineTool({
  name: BUILTIN_TOOL_NAMES.WRITE,
  description: 'Write a UTF-8 file within the active session.',
  inputSchema: writeSchema,
  execute: async ({ path, content }, context) => context.files.write(path, content),
});

export const listTool = defineTool({
  name: BUILTIN_TOOL_NAMES.LIST,
  description: 'List immediate entries within an active-session directory.',
  inputSchema: pathSchema,
  execute: async ({ path }, context) => context.files.list(path),
});

export const filesystemTools = Object.freeze([readTool, writeTool, listTool] as const);

function asRecord(input: unknown): Record<PropertyKey, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Expected an object');
  }

  return input as Record<PropertyKey, unknown>;
}
