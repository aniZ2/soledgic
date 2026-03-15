// SERVICE_ID: SVC_TAX_ENGINE
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

  const { data: rpcRows, error: rpcError } = await supabase.rpc('compute_tax_year_summaries', {
    p_ledger_id: ledger.id,
    p_tax_year: taxYear,
  })

  if (rpcError) {
    console.error('getTaxSummaryResponse RPC error:', rpcError)
    return resourceError('Failed to compute tax summaries', 500, {}, 'tax_summary_rpc_failed')
  }

  let rows = (rpcRows || []) as Array<{
    entity_id: string
    gross_earnings: number
    refunds_issued: number
    net_earnings: number
    total_paid_out: number
    requires_1099: boolean
    linked_user_id: string | null
    has_tax_profile: boolean
  }>

  if (normalizedParticipantId) {
    rows = rows.filter((r) => r.entity_id === normalizedParticipantId)
  }

  const summaries: Array<Record<string, unknown>> = []
  let totalGross = 0
  let totalRefunds = 0
  let totalNet = 0
  let totalPaid = 0
  let participantsRequiring1099 = 0

  for (const row of rows) {
    const grossEarnings = Number(row.gross_earnings)
    const refundsIssued = Number(row.refunds_issued)
    const netEarnings = Number(row.net_earnings)
    const payoutsTotal = Number(row.total_paid_out)

    if (grossEarnings > 0 || payoutsTotal > 0) {
      const taxProfile = row.has_tax_profile
        ? await getSharedTaxProfileSummary(supabase, row.linked_user_id)
        : null

      summaries.push({
        participant_id: row.entity_id,
        linked_user_id: row.linked_user_id,
        gross_earnings: grossEarnings,
        refunds_issued: refundsIssued,
        net_earnings: netEarnings,
        total_paid_out: payoutsTotal,
        requires_1099: row.requires_1099,
        shared_tax_profile: taxProfile,
      })

      totalGross += grossEarnings
      totalRefunds += refundsIssued
      totalNet += netEarnings
      totalPaid += payoutsTotal
      if (row.requires_1099) participantsRequiring1099 += 1
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

export interface MarkFiledBulkInput {
  tax_year?: number
}

export async function markTaxDocumentsFiledBulkResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: MarkFiledBulkInput,
  requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(body.tax_year)

  const { data: updatedDocuments, error } = await supabase
    .from('tax_documents')
    .update({
      status: 'filed',
      filed_at: new Date().toISOString(),
    })
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)
    .eq('status', 'exported')
    .select('id, tax_year, status')

  if (error) {
    console.error('markTaxDocumentsFiledBulkResponse error:', error)
    return resourceError('Failed to mark tax documents as filed', 500, {}, 'tax_documents_mark_filed_failed')
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'mark_tax_documents_filed_bulk',
    entity_type: 'tax_documents',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      count: updatedDocuments?.length || 0,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    message: 'Documents marked as filed',
    tax_year: taxYear,
    count: updatedDocuments?.length || 0,
  })
}

export interface DeliverCopyBInput {
  tax_year?: number
}

export async function deliverTaxDocumentCopyBResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: DeliverCopyBInput,
  requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(body.tax_year)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL')

  if (!supabaseUrl || !serviceKey) {
    return resourceError('Service configuration error', 500, {}, 'service_config_error')
  }

  if (!resendApiKey || !fromEmail) {
    return resourceError('Email configuration missing (RESEND_API_KEY / FROM_EMAIL)', 500, {}, 'email_config_error')
  }

  // Fetch all tax documents for the ledger/year that meet the 1099 threshold
  const { data: documents, error: docsError } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)
    .gte('gross_amount', 600)

  if (docsError) {
    console.error('deliverTaxDocumentCopyBResponse fetch error:', docsError)
    return resourceError('Failed to fetch tax documents', 500, {}, 'tax_documents_fetch_failed')
  }

  if (!documents || documents.length === 0) {
    return resourceOk({
      success: true,
      tax_year: taxYear,
      delivery: { sent: 0, failed: 0, skipped: 0 },
    })
  }

  // Fetch ledger business name for email template
  const { data: ledgerData } = await supabase
    .from('ledgers')
    .select('business_name')
    .eq('id', ledger.id)
    .single()

  const businessName = ledgerData?.business_name || 'Platform'

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const doc of documents) {
    try {
      // Already delivered — skip
      if (doc.metadata?.copy_b_sent_at) {
        skipped++
        continue
      }

      // Look up creator email via participant_identity_links → user profile or account metadata
      const recipientId = doc.recipient_id
      let recipientEmail: string | null = null
      let recipientName: string | null = null

      // Try participant_identity_links → auth.users email
      const linkedUserId = await getLinkedUserIdForParticipant(supabase, ledger.id, recipientId)
      if (linkedUserId) {
        // Check shared_tax_profiles for email (tax submissions may have contact email)
        const { data: taxProfile } = await supabase
          .from('shared_tax_profiles')
          .select('legal_name')
          .eq('user_id', linkedUserId)
          .maybeSingle()

        if (taxProfile?.legal_name) {
          recipientName = taxProfile.legal_name
        }

        // Look up user email from auth
        const { data: userData } = await supabase.auth.admin.getUserById(linkedUserId)
        if (userData?.user?.email) {
          recipientEmail = userData.user.email
        }
      }

      // Fallback: check account metadata for email
      if (!recipientEmail) {
        const { data: account } = await supabase
          .from('accounts')
          .select('name, metadata')
          .eq('ledger_id', ledger.id)
          .eq('entity_id', recipientId)
          .eq('account_type', 'creator_balance')
          .maybeSingle()

        if (account?.metadata?.email) {
          recipientEmail = account.metadata.email
        }
        if (!recipientName && account?.name) {
          recipientName = account.name
        }
      }

      if (!recipientEmail) {
        skipped++
        continue
      }

      // Generate Copy B PDF via internal generate-pdf call
      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_type: '1099_nec_form',
          ledger_id: ledger.id,
          tax_year: doc.tax_year,
          gross_amount: Number(doc.gross_amount),
          federal_withholding: Number(doc.federal_withholding || 0),
          state_withholding: Number(doc.state_withholding || 0),
          recipient_id: doc.recipient_id,
          copy_type: 'b',
        }),
      })

      const pdfResult = await pdfRes.json()
      if (!pdfResult.success || !pdfResult.data) {
        console.error(`Copy B PDF generation failed for doc ${doc.id}`)
        failed++
        continue
      }

      // Send email via Resend (following send-statements pattern)
      const subject = `Your ${taxYear} Form 1099-NEC from ${businessName}`
      const textBody = [
        `Hello${recipientName ? ` ${recipientName}` : ''},`,
        '',
        `Attached is your Form 1099-NEC (Copy B) for tax year ${taxYear} from ${businessName}.`,
        '',
        'This form reports the nonemployee compensation you received during the tax year.',
        'Please retain this copy for your tax records.',
        '',
        'If you have questions about the amounts reported, please contact us.',
        '',
        `Best regards,`,
        businessName,
      ].join('\n')

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: recipientEmail,
          subject,
          text: textBody,
          attachments: [{
            content: pdfResult.data,
            filename: pdfResult.filename || `1099_nec_${taxYear}_copy_b.pdf`,
          }],
        }),
      })

      const emailData = await emailRes.json()

      if (!emailRes.ok) {
        console.error(`Copy B email failed for doc ${doc.id}:`, emailData.message)
        failed++
        continue
      }

      // Mark document with copy_b_sent_at timestamp in metadata
      const existingMetadata = doc.metadata || {}
      await supabase
        .from('tax_documents')
        .update({
          metadata: {
            ...existingMetadata,
            copy_b_sent_at: new Date().toISOString(),
            copy_b_email: recipientEmail,
            copy_b_message_id: emailData.id,
          },
        })
        .eq('id', doc.id)

      // Log to email_log (fire-and-forget like send-statements)
      Promise.resolve(
        supabase.from('email_log').insert({
          ledger_id: ledger.id,
          creator_id: recipientId,
          email_type: '1099_copy_b',
          recipient_email: recipientEmail,
          subject,
          status: 'sent',
          message_id: emailData.id,
          period_year: taxYear,
        }),
      ).then(() => {}).catch(() => {})

      sent++
    } catch (err) {
      console.error(`Copy B delivery error for doc ${doc.id}:`, err)
      failed++
    }
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'deliver_1099_copy_b',
    entity_type: 'tax_documents',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      sent,
      failed,
      skipped,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    tax_year: taxYear,
    delivery: { sent, failed, skipped },
  })
}

export interface GeneratePdfInput {
  document_id?: string
  copy_type?: 'a' | 'b' | '1' | '2'
}

export interface GeneratePdfBatchInput {
  tax_year?: number
  copy_type?: 'a' | 'b' | '1' | '2'
}

export async function generateTaxDocumentPdfResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  documentIdRaw: string,
  body: GeneratePdfInput,
  requestId: string,
): Promise<ResourceResult> {
  const documentId = validateId(documentIdRaw, 100)
  if (!documentId) {
    return resourceError('document_id is invalid', 400, {}, 'invalid_document_id')
  }

  const { data: doc, error: docError } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('id', documentId)
    .eq('ledger_id', ledger.id)
    .single()

  if (docError || !doc) {
    return resourceError('Document not found', 404, {}, 'tax_document_not_found')
  }

  const copyType = body.copy_type || doc.copy_type || 'b'

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return resourceError('Service configuration error', 500, {}, 'service_config_error')
  }

  const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_type: '1099_nec_form',
      ledger_id: ledger.id,
      tax_year: doc.tax_year,
      gross_amount: Number(doc.gross_amount),
      federal_withholding: Number(doc.federal_withholding || 0),
      state_withholding: Number(doc.state_withholding || 0),
      recipient_id: doc.recipient_id,
      copy_type: copyType,
    }),
  })

  const pdfResult = await pdfRes.json()
  if (!pdfResult.success || !pdfResult.data) {
    return resourceError('PDF generation failed', 500, {}, 'pdf_generation_failed')
  }

  // Decode base64 and upload to Supabase Storage
  const pdfBytes = Uint8Array.from(atob(pdfResult.data), (c) => c.charCodeAt(0))
  const storagePath = `${ledger.id}/${doc.tax_year}/${doc.id}_copy_${copyType}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('tax-documents')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return resourceError('Failed to store PDF', 500, {}, 'pdf_upload_failed')
  }

  // Update tax_documents record
  await supabase
    .from('tax_documents')
    .update({
      pdf_path: storagePath,
      pdf_generated_at: new Date().toISOString(),
      copy_type: copyType,
    })
    .eq('id', documentId)

  // Generate signed URL for download (1 hour expiry)
  const { data: signedUrl } = await supabase.storage
    .from('tax-documents')
    .createSignedUrl(storagePath, 3600)

  return resourceOk({
    success: true,
    data: {
      document_id: documentId,
      pdf_path: storagePath,
      pdf_generated_at: new Date().toISOString(),
      copy_type: copyType,
      download_url: signedUrl?.signedUrl || null,
    },
  })
}

export async function generateTaxDocumentPdfBatchResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: GeneratePdfBatchInput,
  requestId: string,
): Promise<ResourceResult> {
  const taxYear = normalizeTaxYear(body.tax_year)
  const copyType = body.copy_type || 'b'

  const { data: docs, error: docsError } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('tax_year', taxYear)

  if (docsError) {
    return resourceError('Failed to fetch documents', 500, {}, 'tax_documents_fetch_failed')
  }

  if (!docs || docs.length === 0) {
    return resourceOk({
      success: true,
      data: { generated: 0, failed: 0, tax_year: taxYear },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return resourceError('Service configuration error', 500, {}, 'service_config_error')
  }

  let generated = 0
  let failed = 0

  for (const doc of docs) {
    try {
      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_type: '1099_nec_form',
          ledger_id: ledger.id,
          tax_year: doc.tax_year,
          gross_amount: Number(doc.gross_amount),
          federal_withholding: Number(doc.federal_withholding || 0),
          state_withholding: Number(doc.state_withholding || 0),
          recipient_id: doc.recipient_id,
          copy_type: copyType,
        }),
      })

      const pdfResult = await pdfRes.json()
      if (!pdfResult.success || !pdfResult.data) {
        failed++
        continue
      }

      const pdfBytes = Uint8Array.from(atob(pdfResult.data), (c) => c.charCodeAt(0))
      const storagePath = `${ledger.id}/${doc.tax_year}/${doc.id}_copy_${copyType}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('tax-documents')
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        failed++
        continue
      }

      await supabase
        .from('tax_documents')
        .update({
          pdf_path: storagePath,
          pdf_generated_at: new Date().toISOString(),
          copy_type: copyType,
        })
        .eq('id', doc.id)

      generated++
    } catch {
      failed++
    }
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'generate_1099_pdf_batch',
    entity_type: 'tax_documents',
    actor_type: 'api',
    request_body: sanitizeForAudit({
      tax_year: taxYear,
      copy_type: copyType,
      generated,
      failed,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    data: { tax_year: taxYear, copy_type: copyType, generated, failed },
  })
}

export async function issueCorrectedTaxDocumentResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  documentIdRaw: string,
  body: Record<string, unknown>,
  requestId: string,
): Promise<ResourceResult> {
  const documentId = validateId(documentIdRaw, 100)
  if (!documentId) {
    return resourceError('Invalid document_id', 400, {}, 'invalid_document_id')
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return resourceError('reason is required for corrections', 400, {}, 'missing_correction_reason')
  }

  const { data: original, error: fetchError } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('id', documentId)
    .single()

  if (fetchError || !original) {
    return resourceError('Tax document not found', 404, {}, 'tax_document_not_found')
  }

  const correctedGross = typeof body.gross_amount === 'number'
    ? body.gross_amount
    : Number(original.gross_amount)
  const correctedFederal = typeof body.federal_withholding === 'number'
    ? body.federal_withholding
    : (original.federal_withholding != null ? Number(original.federal_withholding) : null)
  const correctedState = typeof body.state_withholding === 'number'
    ? body.state_withholding
    : (original.state_withholding != null ? Number(original.state_withholding) : null)

  const { data: corrected, error: insertError } = await supabase
    .from('tax_documents')
    .insert({
      ledger_id: ledger.id,
      document_type: original.document_type,
      tax_year: original.tax_year,
      recipient_type: original.recipient_type,
      recipient_id: original.recipient_id,
      gross_amount: correctedGross,
      federal_withholding: correctedFederal,
      state_withholding: correctedState,
      transaction_count: original.transaction_count,
      monthly_amounts: original.monthly_amounts,
      status: 'calculated',
      copy_type: original.copy_type,
      metadata: {
        ...(original.metadata && typeof original.metadata === 'object' ? original.metadata : {}),
        is_correction: true,
        corrects_document_id: original.id,
        correction_reason: reason,
        original_gross_amount: Number(original.gross_amount),
      },
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('issueCorrectedTaxDocumentResponse insert error:', insertError)
    return resourceError('Failed to create corrected document', 500, {}, 'correction_create_failed')
  }

  await supabase
    .from('tax_documents')
    .update({
      status: 'superseded',
      metadata: {
        ...(original.metadata && typeof original.metadata === 'object' ? original.metadata : {}),
        superseded_by: corrected.id,
        superseded_at: new Date().toISOString(),
      },
    })
    .eq('id', original.id)

  if (correctedGross !== Number(original.gross_amount)) {
    await supabase.from('tax_year_summaries').upsert({
      ledger_id: ledger.id,
      entity_id: original.recipient_id,
      tax_year: original.tax_year,
      gross_earnings: correctedGross,
      refunds_issued: 0,
      net_earnings: correctedGross,
      total_paid_out: 0,
      requires_1099: correctedGross >= 600,
      is_corrected: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ledger_id,entity_id,tax_year,is_corrected' })
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'issue_corrected_1099',
    entity_type: 'tax_document',
    entity_id: corrected.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      original_document_id: original.id,
      corrected_document_id: corrected.id,
      reason,
      original_gross: Number(original.gross_amount),
      corrected_gross: correctedGross,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return resourceOk({
    success: true,
    correction: {
      id: corrected.id,
      original_document_id: original.id,
      recipient_id: original.recipient_id,
      tax_year: original.tax_year,
      gross_amount: correctedGross,
      federal_withholding: correctedFederal,
      state_withholding: correctedState,
      reason,
      status: 'calculated',
    },
  })
}
