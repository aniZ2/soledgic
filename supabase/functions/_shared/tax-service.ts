import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateId,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface TaxDocumentListInput {
  tax_year?: number
}

export interface TaxDocumentGenerateInput {
  tax_year?: number
}

export interface TaxSummaryInput {
  tax_year?: number
  participant_id?: string
  creator_id?: string
}

function normalizeTaxYear(value: number | undefined): number {
  const currentYear = new Date().getFullYear()
  return value && value >= 2020 && value <= currentYear ? value : currentYear - 1
}

async function getLinkedUserIdForParticipant(
  supabase: SupabaseClient,
  ledgerId: string,
  participantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('participant_identity_links')
    .select('user_id')
    .eq('ledger_id', ledgerId)
    .eq('participant_id', participantId)
    .maybeSingle()

  return data?.user_id || null
}

async function getSharedTaxProfileSummary(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<{ status: string; legal_name: string | null; tax_id_last4: string | null } | null> {
  if (!userId) return null

  const { data } = await supabase
    .from('shared_tax_profiles')
    .select('status, legal_name, tax_id_last4')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null
  return {
    status: data.status || 'draft',
    legal_name: data.legal_name || null,
    tax_id_last4: data.tax_id_last4 || null,
  }
}

export async function listTaxDocumentsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: TaxDocumentListInput,
  _requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(options.tax_year)

  const { data: documents, error } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)
    .order('gross_amount', { ascending: false })

  if (error) {
    console.error('listTaxDocumentsResponse error:', error)
    return resourceError('Failed to list tax documents', 500, {}, 'tax_documents_list_failed')
  }

  return resourceOk({
    success: true,
    tax_year: taxYear,
    summary: {
      total_documents: documents?.length || 0,
      total_amount: (documents || []).reduce((sum, document) => sum + Number(document.gross_amount || 0), 0),
      by_status: {
        calculated: (documents || []).filter((document) => document.status === 'calculated').length,
        exported: (documents || []).filter((document) => document.status === 'exported').length,
        filed: (documents || []).filter((document) => document.status === 'filed').length,
      },
    },
    documents: documents || [],
  })
}

export async function getTaxDocumentResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  documentIdRaw: string,
  _requestId: string,
): Promise<ResourceResult> {
  const documentId = validateId(documentIdRaw, 100)
  if (!documentId) {
    return resourceError('document_id is invalid', 400, {}, 'invalid_document_id')
  }

  const { data: document, error } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('id', documentId)
    .eq('ledger_id', ledger.id)
    .maybeSingle()

  if (error) {
    console.error('getTaxDocumentResponse error:', error)
    return resourceError('Failed to load tax document', 500, {}, 'tax_document_lookup_failed')
  }

  if (!document?.id) {
    return resourceError('Tax document not found', 404, {}, 'tax_document_not_found')
  }

  return resourceOk({
    success: true,
    document,
  })
}

export async function generateTaxDocumentsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: TaxDocumentGenerateInput,
  requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(body.tax_year)

  const { data, error } = await supabase.rpc('generate_1099_documents', {
    p_ledger_id: ledger.id,
    p_tax_year: taxYear,
  })

  if (error) {
    console.error('generateTaxDocumentsResponse error:', error)
    return resourceError('Failed to generate tax documents', 500, {}, 'tax_documents_generate_failed')
  }

  const result = Array.isArray(data) ? data[0] : data || { created: 0, skipped: 0, total_amount: 0 }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'generate_1099_documents',
    entity_type: 'tax_documents',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      created: result?.created || 0,
      skipped: result?.skipped || 0,
      total_amount: result?.total_amount || 0,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    generation: {
      tax_year: taxYear,
      created: result?.created || 0,
      skipped: result?.skipped || 0,
      total_amount: result?.total_amount || 0,
    },
  }, 201)
}

export async function markTaxDocumentFiledResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  documentIdRaw: string,
  requestId: string,
): Promise<ResourceResult> {
  const documentId = validateId(documentIdRaw, 100)
  if (!documentId) {
    return resourceError('document_id is invalid', 400, {}, 'invalid_document_id')
  }

  const { data: updatedDocuments, error } = await supabase
    .from('tax_documents')
    .update({
      status: 'filed',
      filed_at: new Date().toISOString(),
    })
    .eq('ledger_id', ledger.id)
    .eq('id', documentId)
    .select('id, tax_year, status')

  if (error) {
    console.error('markTaxDocumentFiledResponse error:', error)
    return resourceError('Failed to mark tax document as filed', 500, {}, 'tax_document_mark_filed_failed')
  }

  if (!updatedDocuments?.length) {
    return resourceError('Tax document not found', 404, {}, 'tax_document_not_found')
  }

  const document = updatedDocuments[0]

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'mark_tax_document_filed',
    entity_type: 'tax_document',
    entity_id: document.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: document.tax_year,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    document: {
      id: document.id,
      tax_year: document.tax_year,
      status: document.status,
    },
  })
}

export async function calculateParticipantTaxResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  participantIdRaw: string,
  taxYearRaw: number | undefined,
  _requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(participantIdRaw, 100)
  if (!participantId) {
    return resourceError('participant_id is invalid', 400, {}, 'invalid_participant_id')
  }

  const taxYear = normalizeTaxYear(taxYearRaw)

  const { data, error } = await supabase.rpc('calculate_1099_totals', {
    p_ledger_id: ledger.id,
    p_creator_id: participantId,
    p_tax_year: taxYear,
  })

  if (error) {
    console.error('calculateParticipantTaxResponse error:', error)
    return resourceError('Failed to calculate participant tax totals', 500, {}, 'tax_calculation_failed')
  }

  const result = Array.isArray(data) ? data[0] : data || {}
  const linkedUserId = await getLinkedUserIdForParticipant(supabase, ledger.id, participantId)
  const taxProfile = await getSharedTaxProfileSummary(supabase, linkedUserId)

  return resourceOk({
    success: true,
    calculation: {
      participant_id: participantId,
      tax_year: taxYear,
      gross_payments: result?.gross_payments || 0,
      transaction_count: result?.transaction_count || 0,
      requires_1099: Boolean(result?.requires_1099),
      monthly_totals: result?.monthly_totals || {},
      threshold: 600,
      linked_user_id: linkedUserId,
      shared_tax_profile: taxProfile,
    },
  })
}

export async function getTaxSummaryResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: TaxSummaryInput,
  requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(body.tax_year)
  const participantId = body.participant_id || body.creator_id || undefined
  const normalizedParticipantId = participantId ? validateId(participantId, 100) : null

  if (participantId && !normalizedParticipantId) {
    return resourceError('participant_id is invalid', 400, {}, 'invalid_participant_id')
  }

  let accountsQuery = supabase
    .from('accounts')
    .select('id, entity_id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .not('entity_id', 'is', null)

  if (normalizedParticipantId) {
    accountsQuery = accountsQuery.eq('entity_id', normalizedParticipantId)
  }

  const { data: accounts, error: accountsError } = await accountsQuery

  if (accountsError) {
    console.error('getTaxSummaryResponse accounts error:', accountsError)
    return resourceError('Failed to load participant tax accounts', 500, {}, 'tax_summary_accounts_failed')
  }

  const summaries: Array<Record<string, unknown>> = []
  let totalGross = 0
  let totalRefunds = 0
  let totalNet = 0
  let totalPaid = 0
  let participantsRequiring1099 = 0

  for (const account of accounts || []) {
    const { data: salesEntries } = await supabase
      .from('entries')
      .select('amount, transaction:transactions!inner(created_at, transaction_type, status)')
      .eq('account_id', account.id)
      .eq('entry_type', 'credit')

    const grossEarnings = (salesEntries || [])
      .filter((entry: any) => {
        const txYear = new Date(entry.transaction.created_at).getFullYear()
        return txYear === taxYear &&
          entry.transaction.transaction_type === 'sale' &&
          entry.transaction.status === 'completed'
      })
      .reduce((sum: number, entry: any) => sum + Number(entry.amount), 0)

    const { data: debitEntries } = await supabase
      .from('entries')
      .select('amount, transaction:transactions!inner(created_at, transaction_type, status)')
      .eq('account_id', account.id)
      .eq('entry_type', 'debit')

    const refundsIssued = (debitEntries || [])
      .filter((entry: any) => {
        const txYear = new Date(entry.transaction.created_at).getFullYear()
        return txYear === taxYear &&
          entry.transaction.transaction_type === 'refund' &&
          entry.transaction.status === 'completed'
      })
      .reduce((sum: number, entry: any) => sum + Number(entry.amount), 0)

    const payoutsTotal = (debitEntries || [])
      .filter((entry: any) => {
        const txYear = new Date(entry.transaction.created_at).getFullYear()
        return txYear === taxYear &&
          entry.transaction.transaction_type === 'payout' &&
          entry.transaction.status === 'completed'
      })
      .reduce((sum: number, entry: any) => sum + Number(entry.amount), 0)

    const netEarnings = grossEarnings - refundsIssued
    const requires1099 = netEarnings >= 600

    await supabase.from('tax_year_summaries').upsert({
      ledger_id: ledger.id,
      entity_id: account.entity_id,
      tax_year: taxYear,
      gross_earnings: grossEarnings,
      refunds_issued: refundsIssued,
      net_earnings: netEarnings,
      total_paid_out: payoutsTotal,
      requires_1099: requires1099,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ledger_id,entity_id,tax_year,is_corrected' })

    const linkedUserId = await getLinkedUserIdForParticipant(supabase, ledger.id, account.entity_id)
    const taxProfile = await getSharedTaxProfileSummary(supabase, linkedUserId)

    if (grossEarnings > 0 || payoutsTotal > 0) {
      summaries.push({
        participant_id: account.entity_id,
        linked_user_id: linkedUserId,
        gross_earnings: grossEarnings,
        refunds_issued: refundsIssued,
        net_earnings: netEarnings,
        total_paid_out: payoutsTotal,
        requires_1099: requires1099,
        shared_tax_profile: taxProfile,
      })

      totalGross += grossEarnings
      totalRefunds += refundsIssued
      totalNet += netEarnings
      totalPaid += payoutsTotal
      if (requires1099) participantsRequiring1099 += 1
    }
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'generate_tax_summary',
    entity_type: 'tax_year_summaries',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      participant_count: summaries.length,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    tax_year: taxYear,
    note: 'Amounts only. Full filing and TIN handling stay in your primary compliance system or payment processor.',
    summaries: summaries.sort((left, right) => Number(right.net_earnings || 0) - Number(left.net_earnings || 0)),
    totals: {
      total_gross: totalGross,
      total_refunds: totalRefunds,
      total_net: totalNet,
      total_paid: totalPaid,
      participants_requiring_1099: participantsRequiring1099,
    },
  })
}

export async function exportTaxDocumentsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  taxYearRaw: number | undefined,
  formatRaw: string | null,
  requestId: string,
): Promise<Response> {
  const taxYear = normalizeTaxYear(taxYearRaw)
  const format = formatRaw === 'json' ? 'json' : 'csv'

  const { data: documents, error } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)
    .order('recipient_id')

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Export failed',
      error_code: 'tax_documents_export_failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await supabase
    .from('tax_documents')
    .update({
      status: 'exported',
      exported_at: new Date().toISOString(),
      export_format: format,
    })
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)
    .eq('status', 'calculated')

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'export_1099_documents',
    entity_type: 'tax_documents',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      format,
      count: documents?.length || 0,
    }),
  }, requestId)

  if (format === 'json') {
    return new Response(JSON.stringify({
      success: true,
      tax_year: taxYear,
      format: 'json',
      document_count: documents?.length || 0,
      documents: documents || [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = [
    'recipient_id',
    'recipient_type',
    'document_type',
    'tax_year',
    'gross_amount',
    'federal_withholding',
    'state_withholding',
    'transaction_count',
    'status',
  ]
  const rows = (documents || []).map((document) => [
    document.recipient_id,
    document.recipient_type,
    document.document_type,
    document.tax_year,
    document.gross_amount,
    document.federal_withholding || 0,
    document.state_withholding || 0,
    document.transaction_count || 0,
    document.status,
  ].join(','))

  return new Response([headers.join(','), ...rows].join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="1099_export_${taxYear}.csv"`,
    },
  })
}
