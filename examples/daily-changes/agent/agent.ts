import { createAgent } from 'waratah';

import slackPost from './tools/slack-post.js';
import dailyChanges from './schedules/daily-changes.js';
import systemsAnalyst from './subagents/systems-analyst/agent.js';

export default createAgent({
  name: 'daily-changes',
  model: 'fixture-model',
  instructions: ['./instructions.md'],
  tools: [slackPost],
  subagents: [systemsAnalyst],
  channels: [],
  schedules: [dailyChanges],
});
