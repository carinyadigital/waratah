import { defineTool } from 'waratah';

export default defineTool({
  name: 'slack-post',
  description: 'Posts a digest to a fixed Slack channel.',
  inputSchema: {
    parse(input: unknown) {
      return input;
    },
  },
  async execute(input) {
    return input;
  },
});
