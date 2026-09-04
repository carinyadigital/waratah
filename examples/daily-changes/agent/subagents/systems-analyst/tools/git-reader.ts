import { defineTool } from 'waratah';

export default defineTool({
  name: 'git-reader',
  description: 'Reads repository changes for a fixed reporting window.',
  inputSchema: {
    parse(input: unknown) {
      return input;
    },
  },
  async execute(input) {
    return input;
  },
});
