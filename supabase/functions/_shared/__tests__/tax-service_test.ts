import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  listTaxDocumentsResponse,
  getTaxDocumentResponse,
  generateTaxDocumentsResponse,
  markTaxDocumentFiledResponse,
  calculateParticipantTaxResponse,
  markTaxDocumentsFiledBulkResponse,
  issueCorrectedTaxDocumentResponse,
} from '../tax-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// normalizeTaxYear (tested indirectly through exported functions)
// ==========================================================================

Deno.test('list tax documents: defaults to previous year when tax_year is undefined', async () => {
  const currentYear = new Date().getFullYear()
  const expectedYear = currentYear - 1

  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.tax_year, expectedYear)
})

Deno.test('list tax documents: uses provided tax_year when valid', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, { tax_year: 2024 }, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.tax_year, 2024)
})

Deno.test('list tax documents: rejects tax_year before 2020', async () => {
  const currentYear = new Date().getFullYear()

  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, { tax_year: 2019 }, requestId)
  assertEquals(result.status, 200)
  // Falls back to currentYear - 1
  assertEquals(result.body.tax_year, currentYear - 1)
})

Deno.test('list tax documents: rejects tax_year in the future', async () => {
  const currentYear = new Date().getFullYear()

  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, { tax_year: currentYear + 5 }, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.tax_year, currentYear - 1)
})

// ==========================================================================
// listTaxDocumentsResponse — summary computation
// ==========================================================================

Deno.test('list tax documents: computes summary from documents', async () => {
  const docs = [
    { id: 'd1', gross_amount: 1500, status: 'calculated' },
    { id: 'd2', gross_amount: 2500, status: 'exported' },
    { id: 'd3', gross_amount: 700, status: 'filed' },
    { id: 'd4', gross_amount: 300, status: 'calculated' },
  ]

  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() {
          return Promise.resolve({ data: docs, error: null })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, { tax_year: 2025 }, requestId)
  assertEquals(result.status, 200)

  const summary = result.body.summary as Record<string, unknown>
  assertEquals(summary.total_documents, 4)
  assertEquals(summary.total_amount, 5000)

  const byStatus = summary.by_status as Record<string, number>
  assertEquals(byStatus.calculated, 2)
  assertEquals(byStatus.exported, 1)
  assertEquals(byStatus.filed, 1)
})

// ==========================================================================
// getTaxDocumentResponse — validation
// ==========================================================================

Deno.test('get tax document: rejects invalid document_id', async () => {
  const supabase = {} as any
  const result = await getTaxDocumentResponse(req, supabase, ledger, '', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_document_id')
})

Deno.test('get tax document: returns 404 when not found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  const result = await getTaxDocumentResponse(req, supabase, ledger, 'doc_unknown', requestId)
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'tax_document_not_found')
})

// ==========================================================================
// markTaxDocumentFiledResponse — validation
// ==========================================================================

Deno.test('mark tax document filed: rejects invalid document_id', async () => {
  const supabase = {} as any
  const result = await markTaxDocumentFiledResponse(req, supabase, ledger, '', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_document_id')
})

Deno.test('mark tax document filed: returns 404 when no rows updated', async () => {
  const supabase = {
    from() {
      return {
        update() { return this },
        eq() { return this },
        select() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await markTaxDocumentFiledResponse(req, supabase, ledger, 'doc_not_found', requestId)
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'tax_document_not_found')
})

// ==========================================================================
// calculateParticipantTaxResponse — validation
// ==========================================================================

Deno.test('calculate participant tax: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await calculateParticipantTaxResponse(req, supabase, ledger, '', undefined, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

// ==========================================================================
// issueCorrectedTaxDocumentResponse — validation
// ==========================================================================

Deno.test('issue corrected document: rejects invalid document_id', async () => {
  const supabase = {} as any
  const result = await issueCorrectedTaxDocumentResponse(req, supabase, ledger, '', {}, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_document_id')
})

Deno.test('issue corrected document: requires reason', async () => {
  const supabase = {} as any
  const result = await issueCorrectedTaxDocumentResponse(req, supabase, ledger, 'doc_1', {}, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'missing_correction_reason')
})

Deno.test('issue corrected document: requires non-empty reason', async () => {
  const supabase = {} as any
  const result = await issueCorrectedTaxDocumentResponse(req, supabase, ledger, 'doc_1', { reason: '  ' }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'missing_correction_reason')
})
