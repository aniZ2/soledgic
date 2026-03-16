/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Mutate the SDK and web app lib files — the code our tests are meant to protect
  mutate: [
    'sdk/typescript/src/client.ts',
    'sdk/typescript/src/errors.ts',
    'sdk/typescript/src/webhooks.ts',
    'sdk/typescript/src/helpers.ts',
    'apps/web/src/lib/rate-limit.ts',
    'apps/web/src/lib/api-handler.ts',
    'apps/web/src/lib/fetch-with-csrf.ts',
    'apps/web/src/lib/supabase/middleware.ts',
    'apps/web/src/lib/ledger-functions-client.ts',
  ],

  // Use vitest as the test runner
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },

  // Skip TypeScript checker — vitest handles compilation, and the SDK test file
  // has loose types that fail strict tsc but work fine with vitest's transformer
  checkers: [],

  // Thresholds — start lenient, ratchet up over time
  thresholds: {
    high: 80,    // Green: 80%+ mutants killed
    low: 60,     // Yellow: 60-80%
    break: 35,   // Baseline 2026-03-16: 39.70%. Ratchet up as tests improve.
  },

  // Performance
  concurrency: 4,
  timeoutMS: 30000,

  // Only report killed/survived (not timeouts or no-coverage)
  reporters: ['clear-text', 'html'],
  htmlReporter: {
    fileName: 'test-results/mutation-report.html',
  },

  // Incremental mode — only re-test mutants affected by recent changes
  incremental: true,
  incrementalFile: 'test-results/.stryker-incremental.json',
}
