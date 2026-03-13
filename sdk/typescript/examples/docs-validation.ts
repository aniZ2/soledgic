import Soledgic from '../src/index'

const client = new Soledgic({
  apiKey: 'sk_test_docs_validation',
  baseUrl: 'https://api.soledgic.com/v1',
  apiVersion: '2026-03-01',
})

async function docsSmoke() {
  await client.createParticipant({
    participantId: 'creator_docs_1',
    displayName: 'Docs User',
    email: 'docs@example.com',
  })

  await client.createCheckoutSession({
    participantId: 'creator_docs_1',
    amount: 2999,
    successUrl: 'https://example.com/success',
  })

  await client.createPayout({
    participantId: 'creator_docs_1',
    referenceId: 'payout_docs_1',
    amount: 1500,
  })

  await client.listUnmatchedTransactions()
  await client.autoMatchBankTransaction('agg_txn_docs_1')
  await client.evaluateFraud({
    idempotencyKey: 'fraud_docs_1',
    amount: 2999,
    category: 'digital_goods',
  })
  await client.listFraudPolicies()
  await client.getComplianceOverview({ days: 30, hours: 24 })
  await client.listComplianceAccessPatterns({ hours: 24, limit: 10 })
  await client.listComplianceFinancialActivity({ days: 30 })
  await client.listComplianceSecuritySummary({ days: 30 })
  await client.calculateTaxForParticipant('creator_docs_1', 2025)
  await client.generateAllTaxDocuments(2025)
  await client.listTaxDocuments(2025)
  await client.generateTaxSummary(2025, 'creator_docs_1')
}

void docsSmoke
