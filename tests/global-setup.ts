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
  const baseUrl = env.SOLEDGIC_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'

  if (isPlaceholder(apiKey) || isPlaceholder(anonKey)) {
    console.log('⚠️ Missing real TEST_API_KEY_BOOKLYVERSE or SUPABASE_ANON_KEY - skipping cleanup\n')
    return
  }

  try {
    const client = new SoledgicTestClient(apiKey, anonKey, baseUrl)
    await client.cleanupTestData()
    console.log('✅ Test data cleanup complete\n')
  } catch (error: any) {
    console.error('⚠️ Test data cleanup failed:', error.message)
    console.log('Continuing with tests anyway...\n')
  }
}
