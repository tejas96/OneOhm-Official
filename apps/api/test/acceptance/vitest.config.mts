import { defineConfig } from 'vitest/config';

// PRD section-13 scenarios. Run through `pnpm test:acceptance`, never `pnpm check`:
// they need the throw-away database and the API on port 4300 that the runner starts.
export default defineConfig({
  test: {
    include: ['scenarios/*.acceptance.ts'],
    globalSetup: ['./support/global-setup.ts'],
    // One file at a time: scenarios share staff, and load-based assignment must be stable.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    sequence: { concurrent: false },
  },
});
