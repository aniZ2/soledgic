import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load .env.test file
  const env = loadEnv('test', process.cwd(), '')

  return {
    test: {
      // Unit tests only — stress tests use vitest.stress.config.ts (npm run test:stress)
      include: ['sdk/typescript/src/**/*.test.ts', 'api/src/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 10000,
    },
  }
})
