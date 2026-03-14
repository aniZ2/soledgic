import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getNumberParam,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  calculateParticipantTaxResponse,
  exportTaxDocumentsResponse,
  generateTaxDocumentsResponse,
  generateTaxDocumentPdfResponse,
  generateTaxDocumentPdfBatchResponse,
  getTaxDocumentResponse,
  getTaxSummaryResponse,
  listTaxDocumentsResponse,
  markTaxDocumentFiledResponse,
  markTaxDocumentsFiledBulkResponse,
} from '../_shared/tax-service.ts'

const handler = createHandler(
  { endpoint: 'tax', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'tax')
    const url = new URL(req.url)

    if (segments.length === 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (segments.length === 2 && segments[0] === 'documents' && segments[1] === 'export') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      return exportTaxDocumentsResponse(
        req,
        supabase,
        ledger,
        getNumberParam(url, 'tax_year'),
        url.searchParams.get('format'),
        requestId,
      )
    }

    if (segments.length === 1 && segments[0] === 'documents') {
      if (req.method === 'GET') {
        const result = await listTaxDocumentsResponse(req, supabase, ledger, {
          tax_year: getNumberParam(url, 'tax_year'),
        }, requestId)
        return respondWithResult(req, requestId, result)
      }

      return errorResponse('Method not allowed', 405, req, requestId)
    }

    // POST /tax/documents/mark-filed (bulk — marks all exported for the year)
    if (segments.length === 2 && segments[0] === 'documents' && segments[1] === 'mark-filed') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body) || {}
      const result = await markTaxDocumentsFiledBulkResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'documents' && segments[1] === 'generate') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await generateTaxDocumentsResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'documents') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await getTaxDocumentResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 3 && segments[0] === 'documents' && segments[2] === 'mark-filed') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await markTaxDocumentFiledResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    // POST /tax/documents/pdf/batch
    if (segments.length === 3 && segments[0] === 'documents' && segments[1] === 'pdf' && segments[2] === 'batch') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await generateTaxDocumentPdfBatchResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    // POST /tax/documents/{id}/pdf
    if (segments.length === 3 && segments[0] === 'documents' && segments[2] === 'pdf') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body) || {}
      const result = await generateTaxDocumentPdfResponse(req, supabase, ledger, segments[1], payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'summaries') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await getTaxSummaryResponse(req, supabase, ledger, {
        tax_year: getNumberParam(url, 'tax_year') || Number(segments[1]),
        participant_id: url.searchParams.get('participant_id') || url.searchParams.get('creator_id') || undefined,
      }, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'calculations') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await calculateParticipantTaxResponse(
        req,
        supabase,
        ledger,
        segments[1],
        getNumberParam(url, 'tax_year'),
        requestId,
      )
      return respondWithResult(req, requestId, result)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
