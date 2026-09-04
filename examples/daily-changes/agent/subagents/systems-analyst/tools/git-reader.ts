import { defineTool } from 'waratah';

export interface GitLookbackInput {
  readonly since: string;
  readonly until: string;
}

export interface GitReaderAdapter {
  read(input: GitLookbackInput): Promise<{
    readonly repository: string;
    readonly branch: string;
    readonly since: string;
    readonly until: string;
    readonly commits: readonly unknown[];
    readonly pullRequests: readonly unknown[];
  }>;
}

const lookbackSchema = {
  parse(input: unknown): GitLookbackInput {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('Expected lookback input');
    }
    const value = input as Record<PropertyKey, unknown>;
    if (typeof value.since !== 'string' || typeof value.until !== 'string') {
      throw new TypeError('Expected since and until');
    }
    return { since: value.since, until: value.until };
  },
};

export function createGitReaderTool(options: {
  readonly repository: string;
  readonly branch: string;
  readonly read?: GitReaderAdapter['read'];
}) {
  const read =
    options.read ??
    (async (input: GitLookbackInput) => ({
      repository: options.repository,
      branch: options.branch,
      since: input.since,
      until: input.until,
      commits: [],
      pullRequests: [],
    }));

  return defineTool({
    name: 'git-reader',
    description: 'Reads repository changes for a fixed reporting window.',
    inputSchema: lookbackSchema,
    execute: async (input) => read(input),
  });
}

export default createGitReaderTool({
  repository: process.env.WARATAH_GIT_REPOSITORY ?? 'acme/app',
  branch: process.env.WARATAH_GIT_BRANCH ?? 'main',
});
