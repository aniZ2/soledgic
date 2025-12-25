import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load .env.test file
  const env = loadEnv('test', process.cwd(), '')

  return {
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 10000,
      env: env,
      globalSetup: ['./tests/global-setup.ts'],
    },
  }
})
