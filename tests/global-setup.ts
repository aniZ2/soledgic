// Global setup for stress tests - runs once before all tests
// Cleans up test data to ensure a clean slate

import { loadEnv } from 'vite'
import { SoledgicTestClient } from './test-client'

function isPlaceholder(value: string | undefined): boolean {
  const v = (value || '').trim().toLowerCase()
  if (!v) return true
  return v.includes('replace_with') || v.includes('your_') || v === 'sk_test_replace_with_local_key'
}

export default async function globalSetup() {
  console.log('\n🧹 Cleaning up test data before running stress tests...')

  // Load environment variables from .env.test
  const env = loadEnv('test', process.cwd(), '')

  const apiKey = env.TEST_API_KEY_BOOKLYVERSE
  const anonKey = env.SUPABASE_ANON_KEY
  const baseUrl = env.SOLEDGIC_URL
  if (!baseUrl) {
    console.log('⚠️ Missing SOLEDGIC_URL - skipping cleanup\n')
    return
  }

  if (isPlaceholder(apiKey) || isPlaceholder(anonKey)) {
    console.log('⚠️ Missing real TEST_API_KEY_BOOKLYVERSE or SUPABASE_ANON_KEY - skipping cleanup\n')
    return
  }

  const client = new SoledgicTestClient(apiKey, anonKey, baseUrl)

  // Verify the API is reachable before running tests
  try {
    await client.getBalances()
    console.log('✅ API is reachable\n')
  } catch (error: any) {
    if (error.status === 429) {
      throw new Error(`API is rate-limited (429). Wait 60s for the window to reset before running E2E.`)
    }
    throw new Error(`API is not reachable: ${error.message}. Cannot run E2E tests.`)
  }

  // Cleanup is best-effort — each test run uses unique timestamped IDs
  try {
    await client.cleanupTestData()
    console.log('✅ Test data cleanup complete\n')
  } catch {
    console.log('⚠️ Cleanup endpoint not available (expected on shared envs). Tests use unique IDs.\n')
  }
}
