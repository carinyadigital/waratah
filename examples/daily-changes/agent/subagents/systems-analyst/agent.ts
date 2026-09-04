import { createAgent } from 'waratah';

import gitReader from './tools/git-reader.js';

export default createAgent({
  name: 'systems-analyst',
  kind: 'subagent',
  model: 'fixture-model',
  instructions: ['./instructions.md'],
  tools: [gitReader],
  subagents: [],
  channels: [],
});
