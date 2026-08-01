import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'scripts/**/*.test.ts',
      'agents/**/*.test.ts',
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
