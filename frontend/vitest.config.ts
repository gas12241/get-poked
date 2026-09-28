import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Vitest's 5000ms default is too tight for the quiz tests, which
      // wait out CaseOpeningReel's real ~4.5s spin+flip sequence — one of
      // them (resuming an in-progress quiz) does that twice in a row. A
      // single global bump is simpler than tuning a per-test timeout on
      // every affected test, and still catches a genuine hang.
      testTimeout: 15000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  }),
);
