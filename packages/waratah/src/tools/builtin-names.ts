export const BUILTIN_TOOL_NAMES = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  LIST: 'list',
  TASK: 'task',
} as const);

const reservedNames = new Set<string>(Object.values(BUILTIN_TOOL_NAMES));

export function isBuiltinToolName(name: string): boolean {
  return reservedNames.has(name);
}
