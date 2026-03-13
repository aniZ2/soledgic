import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  getNumberParam,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  getComplianceOverviewResponse,
  listComplianceAccessPatternsResponse,
  listComplianceFinancialActivityResponse,
  listComplianceSecuritySummaryResponse,
} from '../_shared/compliance-service.ts'

const handler = createHandler(
  { endpoint: 'compliance', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const segments = getResourceSegments(req, 'compliance')
    const days = getNumberParam(url, 'days')
    const hours = getNumberParam(url, 'hours')
    const limit = getNumberParam(url, 'limit')

    if (segments.length === 0 || (segments.length === 1 && segments[0] === 'overview')) {
      const result = await getComplianceOverviewResponse(req, supabase, ledger, { days, hours }, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'access-patterns') {
      const result = await listComplianceAccessPatternsResponse(req, supabase, ledger, { hours, limit }, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'financial-activity') {
      const result = await listComplianceFinancialActivityResponse(req, supabase, ledger, { days }, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'security-summary') {
      const result = await listComplianceSecuritySummaryResponse(req, supabase, ledger, { days }, requestId)
      return respondWithResult(req, requestId, result)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
