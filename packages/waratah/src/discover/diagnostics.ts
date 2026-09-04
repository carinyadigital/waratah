import type { WaratahErrorCode } from '../shared/errors.js';

/** A precise, secret-safe problem found while compiling an authored agent. */
export interface CompilerDiagnostic {
  readonly code: WaratahErrorCode;
  readonly message: string;
  readonly agent: string;
  readonly file?: string;
  readonly path?: string;
}

/** A compile failure containing every problem discovery could safely identify. */
export class CompilerError extends Error {
  readonly diagnostics: readonly CompilerDiagnostic[];

  constructor(diagnostics: readonly CompilerDiagnostic[]) {
    super(formatDiagnostics(diagnostics));
    this.name = 'CompilerError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

function formatDiagnostics(diagnostics: readonly CompilerDiagnostic[]): string {
  const count = diagnostics.length;
  const summary = `Agent compilation failed with ${count} diagnostic${count === 1 ? '' : 's'}.`;
  return [summary, ...diagnostics.map(formatDiagnostic)].join('\n');
}

function formatDiagnostic(diagnostic: CompilerDiagnostic): string {
  const locations = [
    `agent ${JSON.stringify(diagnostic.agent)}`,
    diagnostic.file === undefined ? undefined : `file ${JSON.stringify(diagnostic.file)}`,
    diagnostic.path === undefined ? undefined : `path ${JSON.stringify(diagnostic.path)}`,
  ].filter((location): location is string => location !== undefined);

  return `${diagnostic.code}: ${diagnostic.message} (${locations.join(', ')})`;
}
