#!/usr/bin/env node
/**
 * Demo Data Seeder
 *
 * Populates a test ledger with realistic demo data so new signups
 * can explore the dashboard immediately.
 *
 * Usage:
 *   SOLEDGIC_API_KEY=slk_test_xxx node scripts/seed-demo-data.mjs
 *   npm run seed:demo
 *
 * Creates:
 *   - 5 creators with varying activity levels
 *   - 20 sales across creators
 *   - 3 refunds
 *   - 5 expenses
 *   - 2 payout records
 *   - Wallet deposits for 2 creators
 */

const API_KEY = process.env.SOLEDGIC_API_KEY
const BASE_URL = process.env.SOLEDGIC_URL || 'https://api.soledgic.com/v1'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

if (!API_KEY) {
  console.error('SOLEDGIC_API_KEY is required')
  console.error('Usage: SOLEDGIC_API_KEY=slk_test_xxx node scripts/seed-demo-data.mjs')
  process.exit(1)
}

async function call(endpoint, body) {
  const url = `${BASE_URL}/${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(SUPABASE_ANON_KEY ? { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error(`  FAIL ${endpoint}:`, data.error || res.status)
    return null
  }
  return data
}

function randomAmount(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100)
}

function randomDate(daysBack) {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack))
  return d.toISOString().split('T')[0]
}

const CREATORS = [
  { id: 'creator_emma', name: 'Emma Wright', email: 'emma@example.com', split: 80 },
  { id: 'creator_james', name: 'James Chen', email: 'james@example.com', split: 75 },
  { id: 'creator_sofia', name: 'Sofia Rivera', email: 'sofia@example.com', split: 85 },
  { id: 'creator_alex', name: 'Alex Thompson', email: 'alex@example.com', split: 70 },
  { id: 'creator_luna', name: 'Luna Park', email: 'luna@example.com', split: 80 },
]

const PRODUCTS = [
  { name: 'Digital Art Pack', min: 999, max: 4999 },
  { name: 'Online Course', min: 1999, max: 9999 },
  { name: 'E-Book', min: 299, max: 1499 },
  { name: 'Music Album', min: 799, max: 2999 },
  { name: 'Photography Bundle', min: 1499, max: 5999 },
  { name: 'Template Kit', min: 499, max: 2499 },
  { name: 'Video Tutorial', min: 1299, max: 3999 },
]

const EXPENSE_CATEGORIES = [
  { desc: 'Cloud hosting (AWS)', amount: 15000 },
  { desc: 'Email service (Resend)', amount: 2500 },
  { desc: 'Analytics platform', amount: 4900 },
  { desc: 'Legal consultation', amount: 50000 },
  { desc: 'Design software subscription', amount: 1999 },
]

async function seed() {
  console.log('Seeding demo data...\n')

  // 1. Create creators
  console.log('Creating creators:')
  for (const c of CREATORS) {
    const result = await call('participants', {
      participant_id: c.id,
      display_name: c.name,
      email: c.email,
      default_split_percent: c.split,
    })
    console.log(`  ${result ? '✓' : '✗'} ${c.name} (${c.id})`)
  }

  // 2. Record sales
  console.log('\nRecording sales:')
  const salesPerCreator = [6, 5, 4, 3, 2] // varying activity levels
  let saleCount = 0
  for (let ci = 0; ci < CREATORS.length; ci++) {
    const creator = CREATORS[ci]
    for (let s = 0; s < salesPerCreator[ci]; s++) {
      saleCount++
      const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]
      const amount = randomAmount(product.min / 100, product.max / 100)
      const result = await call('record-sale', {
        creator_id: creator.id,
        amount,
        reference_id: `demo_sale_${saleCount}`,
        description: product.name,
        currency: 'USD',
      })
      console.log(`  ${result ? '✓' : '✗'} Sale #${saleCount}: ${creator.name} — $${(amount / 100).toFixed(2)} (${product.name})`)
    }
  }

  // 3. Record refunds (on first 3 sales)
  console.log('\nRecording refunds:')
  for (let r = 1; r <= 3; r++) {
    const result = await call('refunds', {
      original_sale_reference: `demo_sale_${r}`,
      amount: randomAmount(5, 20),
      reason: 'requested_by_customer',
      reference_id: `demo_refund_${r}`,
    })
    console.log(`  ${result ? '✓' : '✗'} Refund #${r}`)
  }

  // 4. Record expenses
  console.log('\nRecording expenses:')
  for (let e = 0; e < EXPENSE_CATEGORIES.length; e++) {
    const expense = EXPENSE_CATEGORIES[e]
    const result = await call('record-expense', {
      amount: expense.amount,
      reference_id: `demo_expense_${e + 1}`,
      description: expense.desc,
      category: 'operating',
    })
    console.log(`  ${result ? '✓' : '✗'} ${expense.desc} — $${(expense.amount / 100).toFixed(2)}`)
  }

  // 5. Record income
  console.log('\nRecording income:')
  const incomeResult = await call('record-income', {
    amount: 100000,
    reference_id: 'demo_income_1',
    description: 'Platform subscription revenue',
    source: 'recurring',
  })
  console.log(`  ${incomeResult ? '✓' : '✗'} Platform subscription — $1,000.00`)

  console.log('\nDone! Check your dashboard at soledgic.com/dashboard')
}

seed().catch(console.error)
