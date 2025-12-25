import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

// Load test environment variables
config({ path: '.env.test' })

export default defineConfig({
  test: {
    include: ['tests/stress/**/*.test.ts'],
    testTimeout: 300000, // 5 minutes for stress tests
    hookTimeout: 60000,
    reporters: ['verbose'],
    outputFile: 'test-results/stress-results.json',
    // Run tests sequentially to avoid race conditions on shared ledger state
    sequence: {
      shuffle: false,
    },
    // Use single thread to ensure sequential execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
