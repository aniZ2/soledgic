/**
 * Booklyverse Integration Example
 * 
 * This shows how Booklyverse (or any creator platform) would integrate
 * soledgic for handling author earnings, payouts, and refunds.
 */

import { soledgic } from '../src'

// Initialize the SDK
const soledgic = new soledgic({
  apiKey: process.env.soledgic_API_KEY!,
  baseUrl: process.env.SUPABASE_FUNCTIONS_URL!,
})

// ============================================================================
// Example 1: Handle a book purchase (called from Stripe webhook)
// ============================================================================

interface StripePaymentIntent {
  id: string
  amount: number
  metadata: {
    bookId: string
    authorId: string
    buyerId: string
  }
}

async function handleBookPurchase(paymentIntent: StripePaymentIntent) {
  const { id, amount, metadata } = paymentIntent
  
  try {
    // Record the sale in soledgic with 80/20 split (author gets 80%)
    const sale = await soledgic.recordSale({
      referenceId: id,
      referenceType: 'stripe_payment',
      creatorId: metadata.authorId,
      amount: amount, // Stripe amount is already in cents
      platformFeePercent: 20,
      description: `Book purchase: ${metadata.bookId}`,
      metadata: {
        bookId: metadata.bookId,
        buyerId: metadata.buyerId,
      }
    })

    console.log('Sale recorded:', {
      transactionId: sale.transactionId,
      authorEarned: sale.breakdown?.creatorAmount,
      platformEarned: sale.breakdown?.platformAmount,
    })

    return sale

  } catch (error) {
    console.error('Failed to record sale:', error)
    throw error
  }
}

// ============================================================================
// Example 2: Display author earnings dashboard
// ============================================================================

async function getAuthorDashboard(authorId: string) {
  try {
    // Get author's balance
    const { balance } = await soledgic.getCreatorBalance(authorId)
    
    if (!balance) {
      return { earnings: null, transactions: [] }
    }

    // Get recent transactions
    const { transactions } = await soledgic.getTransactions({
      creatorId: authorId,
      perPage: 10,
      includeEntries: false, // Don't need entry details for dashboard
    })

    return {
      earnings: {
        available: balance.available,
        pending: balance.pending,
        totalEarned: balance.totalEarned,
        totalPaidOut: balance.totalPaidOut,
      },
      recentTransactions: transactions?.map(tx => ({
        id: tx.id,
        type: tx.transactionType,
        amount: tx.amount,
        date: tx.createdAt,
        description: tx.description,
      }))
    }

  } catch (error) {
    console.error('Failed to get author dashboard:', error)
    throw error
  }
}

// ============================================================================
// Example 3: Process author payout request
// ============================================================================

async function requestPayout(authorId: string, stripeAccountId: string) {
  try {
    // Check balance first
    const { balance } = await soledgic.getCreatorBalance(authorId)
    
    if (!balance || balance.available < 10) {
      throw new Error('Minimum payout amount is $10')
    }

    // Process the payout (you'd also trigger actual Stripe transfer here)
    const payout = await soledgic.processPayout({
      creatorId: authorId,
      paymentMethod: 'stripe',
      paymentReference: `stripe_transfer_${Date.now()}`, // Would be actual Stripe transfer ID
      description: 'Author payout request',
    })

    console.log('Payout initiated:', {
      payoutId: payout.payoutId,
      amount: payout.amount,
      status: payout.status,
    })

    return payout

  } catch (error) {
    console.error('Failed to process payout:', error)
    throw error
  }
}

// ============================================================================
// Example 4: Handle refund request
// ============================================================================

async function handleRefund(
  stripePaymentIntentId: string, 
  reason: string,
  refundPolicy: 'full' | 'platform_absorbs' = 'full'
) {
  try {
    const refund = await soledgic.recordRefund({
      originalSaleReference: stripePaymentIntentId,
      reason: reason,
      // If platform absorbs, author keeps their share
      refundFrom: refundPolicy === 'platform_absorbs' ? 'platform_only' : 'both',
    })

    console.log('Refund processed:', {
      transactionId: refund.transactionId,
      refundedAmount: refund.refundedAmount,
      authorDeducted: refund.breakdown?.fromCreator,
      platformDeducted: refund.breakdown?.fromPlatform,
    })

    return refund

  } catch (error) {
    console.error('Failed to process refund:', error)
    throw error
  }
}

// ============================================================================
// Example 5: Admin dashboard - platform summary
// ============================================================================

async function getPlatformSummary() {
  try {
    const { balances, platformSummary } = await soledgic.getAllBalances({
      includePlatform: true,
    })

    return {
      // Platform finances
      totalRevenue: platformSummary?.totalRevenue,
      cashOnHand: platformSummary?.cashBalance,
      
      // Creator obligations
      totalOwedToCreators: platformSummary?.totalOwedCreators,
      totalPaidToCreators: platformSummary?.totalPaidOut,
      
      // Top earners
      topCreators: balances?.slice(0, 10).map(b => ({
        creatorId: b.creatorId,
        balance: b.available,
      })),
    }

  } catch (error) {
    console.error('Failed to get platform summary:', error)
    throw error
  }
}

// ============================================================================
// Example 6: Monthly payout batch (for scheduled payouts)
// ============================================================================

async function processMonthlyPayouts(minPayoutAmount: number = 50) {
  try {
    // Get all creators with balances above threshold
    const { balances } = await soledgic.getAllBalances()
    
    const eligibleCreators = balances?.filter(b => b.available >= minPayoutAmount) || []
    
    console.log(`Processing payouts for ${eligibleCreators.length} creators`)

    const results = []
    
    for (const creator of eligibleCreators) {
      try {
        const payout = await soledgic.processPayout({
          creatorId: creator.creatorId,
          paymentMethod: 'stripe',
          description: 'Monthly scheduled payout',
        })
        
        results.push({
          creatorId: creator.creatorId,
          amount: payout.amount,
          status: 'success',
        })
      } catch (error) {
        results.push({
          creatorId: creator.creatorId,
          amount: creator.available,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return results

  } catch (error) {
    console.error('Failed to process monthly payouts:', error)
    throw error
  }
}

// ============================================================================
// Run examples
// ============================================================================

async function main() {
  // Simulate a book purchase
  await handleBookPurchase({
    id: 'pi_test_123',
    amount: 1499, // $14.99
    metadata: {
      bookId: 'book_abc',
      authorId: 'author_123',
      buyerId: 'user_456',
    }
  })

  // Get author dashboard
  const dashboard = await getAuthorDashboard('author_123')
  console.log('Author dashboard:', dashboard)

  // Get platform summary
  const summary = await getPlatformSummary()
  console.log('Platform summary:', summary)
}

// Only run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

export {
  handleBookPurchase,
  getAuthorDashboard,
  requestPayout,
  handleRefund,
  getPlatformSummary,
  processMonthlyPayouts,
}
