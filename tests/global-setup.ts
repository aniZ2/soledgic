// Global setup for stress tests - runs once before all tests
// Cleans up test data to ensure a clean slate

import { loadEnv } from 'vite'
import { SoledgicTestClient } from './test-client'

export default async function globalSetup() {
  console.log('\n🧹 Cleaning up test data before running stress tests...')

  // Load environment variables from .env.test
  const env = loadEnv('test', process.cwd(), '')

  const apiKey = env.TEST_API_KEY_BOOKLYVERSE
  const anonKey = env.SUPABASE_ANON_KEY
  const baseUrl = env.SOLEDGIC_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'

  if (!apiKey || !anonKey) {
    console.log('⚠️ Missing environment variables - skipping cleanup\n')
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
