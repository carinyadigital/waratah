import { defineTool, WaratahError } from 'waratah';

export interface SlackDigestInput {
  readonly text: string;
}

export interface SlackDigestResult {
  readonly ok: boolean;
  readonly messageTs?: string;
}

export interface SlackPostAdapter {
  post(text: string): Promise<SlackDigestResult>;
}

const digestSchema = {
  parse(input: unknown): SlackDigestInput {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TypeError('Expected digest input');
    }
    const text = (input as { readonly text?: unknown }).text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new TypeError('Expected digest text');
    }
    return { text };
  },
};

const postedTurns = new Set<string>();

export function createSlackPostTool(options: {
  readonly channel: string;
  readonly post: SlackPostAdapter['post'];
}) {
  return defineTool({
    name: 'slack-post',
    description: 'Posts a digest to a fixed Slack channel.',
    inputSchema: digestSchema,
    execute: async ({ text }, context) => {
      if (postedTurns.has(context.turnId)) {
        throw new WaratahError(
          'TOOL_EXECUTION_FAILED',
          'This turn already posted a digest. Post at most once.',
        );
      }
      postedTurns.add(context.turnId);
      return options.post(text);
    },
  });
}

export default createSlackPostTool({
  channel: process.env.WARATAH_SLACK_CHANNEL ?? 'C-fixture',
  post: async () => ({ ok: true, messageTs: 'fixture-message' }),
});
