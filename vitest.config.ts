import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load .env.test file
  const env = loadEnv('test', process.cwd(), '')

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'apps/web/src'),
      },
    },
    test: {
      // Unit tests only — stress tests use vitest.stress.config.ts (npm run test:stress)
      include: ['sdk/typescript/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 10000,
      coverage: {
        provider: 'v8',
        include: ['sdk/typescript/src/**/*.ts', 'apps/web/src/lib/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
        thresholds: {
          // Baseline thresholds (2026-03-15) — ratchet up as coverage improves
          // Current: lines 41%, branches 32%, functions 49%, statements 42%
          lines: 38,
          functions: 45,
          branches: 28,
          statements: 38,
        },
      },
    },
  }
})
