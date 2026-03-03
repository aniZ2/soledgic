import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

// Load test environment variables
config({ path: '.env.test' })

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 180000, // 3 minutes per test (includes rate limit retries)
    hookTimeout: 180000, // beforeAll may retry on rate limits
    reporters: ['verbose'],
    outputFile: 'test-results/e2e-results.json',
    // Sequential — E2E tests depend on shared ledger state
    sequence: {
      shuffle: false,
    },
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    globalSetup: './tests/global-setup.ts',
  },
})
