import { defineSchedule } from 'waratah';

export default defineSchedule({
  cron: '0 8 * * *',
  markdown:
    'Analyze repository changes for the last 24 elapsed hours on the configured repository and branch.',
});
