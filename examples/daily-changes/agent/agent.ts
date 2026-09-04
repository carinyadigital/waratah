import { createAgent } from 'waratah';

import slackPost from './tools/slack-post.js';
import cron from './channels/cron.js';
import systemsAnalyst from './subagents/systems-analyst/agent.js';

export default createAgent({
  name: 'daily-changes',
  model: 'fixture-model',
  instructions: ['./instructions.md'],
  skills: [],
  memory: [],
  tools: [slackPost],
  subagents: [systemsAnalyst],
  channels: [cron],
});
