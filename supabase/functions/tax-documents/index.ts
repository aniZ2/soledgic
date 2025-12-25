// Soledgic Edge Function: Tax Documents
// POST /tax-documents - Generate and manage 1099 tax summaries
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse, 
  validateId, 
  getClientIp,
  getCorsHeaders,
  LedgerContext
} from '../_shared/utils.ts'

interface TaxRequest { 
  action: 'calculate' | 'generate_all' | 'list' | 'get' | 'export' | 'mark_filed'
  tax_year?: number
  creator_id?: string
  document_id?: string
  format?: 'csv' | 'json'
}

const VALID_ACTIONS = ['calculate', 'generate_all', 'list', 'get', 'export', 'mark_filed']

const handler = createHandler(
  { endpoint: 'tax-documents', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: TaxRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req, requestId)
    }

    const currentYear = new Date().getFullYear()
    const taxYear = body.tax_year && body.tax_year >= 2020 && body.tax_year <= currentYear ? body.tax_year : currentYear - 1

    switch (body.action) {
      case 'calculate': {
        const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null
        if (!creatorId) return errorResponse('Invalid creator_id', 400, req, requestId)

        const { data, error } = await supabase.rpc('calculate_1099_totals', { 
          p_ledger_id: ledger.id, 
          p_creator_id: creatorId, 
          p_tax_year: taxYear 
        })
        if (error) return errorResponse('Calculation failed', 500, req, requestId)

        const result = data?.[0] || { gross_payments: 0, transaction_count: 0, requires_1099: false, monthly_totals: {} }
        return jsonResponse({ success: true, data: { creator_id: creatorId, tax_year: taxYear, ...result, threshold: 600 } }, 200, req, requestId)
      }

      case 'generate_all': {
        const { data, error } = await supabase.rpc('generate_1099_documents', { 
          p_ledger_id: ledger.id, 
          p_tax_year: taxYear 
        })
        if (error) return errorResponse('Generation failed', 500, req, requestId)

        const result = data?.[0] || { created: 0, skipped: 0, total_amount: 0 }
        
        await supabase.from('audit_log').insert({ 
          ledger_id: ledger.id, 
          action: 'generate_1099_documents', 
          entity_type: 'tax_documents', 
          actor_type: 'api', 
          ip_address: getClientIp(req), 
          request_id: requestId,
          request_body: { tax_year: taxYear, ...result } 
        })
        
        return jsonResponse({ success: true, data: { tax_year: taxYear, ...result } }, 200, req, requestId)
      }

      case 'list': {
        const { data: docs, error } = await supabase
          .from('tax_documents')
          .select('*')
          .eq('ledger_id', ledger.id)
          .eq('tax_year', taxYear)
          .order('gross_amount', { ascending: false })
        
        if (error) return errorResponse('Failed to list documents', 500, req, requestId)

        return jsonResponse({
          success: true,
          data: {
            tax_year: taxYear,
            summary: {
              total_documents: docs?.length || 0,
              total_amount: docs?.reduce((sum, d) => sum + Number(d.gross_amount), 0) || 0,
              by_status: { 
                calculated: docs?.filter(d => d.status === 'calculated').length || 0, 
                exported: docs?.filter(d => d.status === 'exported').length || 0, 
                filed: docs?.filter(d => d.status === 'filed').length || 0 
              }
            },
            documents: docs || []
          }
        }, 200, req, requestId)
      }

      case 'get': {
        const documentId = body.document_id ? validateId(body.document_id, 100) : null
        if (!documentId) return errorResponse('Invalid document_id', 400, req, requestId)

        const { data: doc, error } = await supabase
          .from('tax_documents')
          .select('*')
          .eq('id', documentId)
          .eq('ledger_id', ledger.id)
          .single()
        
        if (error || !doc) return errorResponse('Document not found', 404, req, requestId)

        return jsonResponse({ success: true, data: doc }, 200, req, requestId)
      }

      case 'export': {
        const format = body.format === 'json' ? 'json' : 'csv'
        const { data: docs, error } = await supabase
          .from('tax_documents')
          .select('*')
          .eq('ledger_id', ledger.id)
          .eq('tax_year', taxYear)
          .order('recipient_id')
        
        if (error) return errorResponse('Export failed', 500, req, requestId)

        await supabase
          .from('tax_documents')
          .update({ status: 'exported', exported_at: new Date().toISOString(), export_format: format })
          .eq('ledger_id', ledger.id)
          .eq('tax_year', taxYear)
          .eq('status', 'calculated')

        await supabase.from('audit_log').insert({ 
          ledger_id: ledger.id, 
          action: 'export_1099_documents', 
          entity_type: 'tax_documents', 
          actor_type: 'api', 
          ip_address: getClientIp(req), 
          request_id: requestId,
          request_body: { tax_year: taxYear, format, count: docs?.length || 0 } 
        })

        if (format === 'csv') {
          const headers = ['recipient_id', 'recipient_type', 'document_type', 'tax_year', 'gross_amount', 'federal_withholding', 'state_withholding', 'transaction_count', 'status']
          const rows = (docs || []).map(doc => [
            doc.recipient_id, doc.recipient_type, doc.document_type, doc.tax_year, 
            doc.gross_amount, doc.federal_withholding || 0, doc.state_withholding || 0, 
            doc.transaction_count || 0, doc.status
          ].join(','))
          const csv = [headers.join(','), ...rows].join('\n')
          return new Response(csv, { 
            status: 200, 
            headers: { 
              ...getCorsHeaders(req), 
              'Content-Type': 'text/csv', 
              'Content-Disposition': `attachment; filename="1099_export_${taxYear}.csv"` 
            } 
          })
        }

        return jsonResponse({ success: true, data: { tax_year: taxYear, format: 'json', document_count: docs?.length || 0, documents: docs || [] } }, 200, req, requestId)
      }

      case 'mark_filed': {
        const documentId = body.document_id ? validateId(body.document_id, 100) : null
        if (documentId) {
          await supabase.from('tax_documents').update({ status: 'filed' }).eq('id', documentId).eq('ledger_id', ledger.id)
        } else {
          await supabase.from('tax_documents').update({ status: 'filed' }).eq('ledger_id', ledger.id).eq('tax_year', taxYear).eq('status', 'exported')
        }
        return jsonResponse({ success: true, message: 'Documents marked as filed' }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
