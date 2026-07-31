/** Shared `--flag value` parsing for every script and agent CLI entry point. */

/** Reads `--<name> <value>` from process.argv; returns fallback if the flag is absent. */
export const arg = (name: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

/** Reads a boolean `--<name>` presence flag from process.argv. */
export const flag = (name: string): boolean => process.argv.includes(`--${name}`);
