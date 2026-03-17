import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'
import { createHash } from 'crypto'

async function requirePlatformAdmin(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isPlatformOperatorUser(user)) return null
  // Return a dummy membership — platform admin acts across all orgs
  return { organization_id: null as string | null, role: 'platform_admin' }
}

function makeApiKey(livemode: boolean): string {
  return `sk_${livemode ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

export const GET = createApiHandler(
  async (request, { user }) => {
    const membership = await requirePlatformAdmin(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')

    const serviceClient = createServiceRoleClient()

    // If requesting documents for a specific org, return them with signed URLs
    const orgIdForDocs = searchParams.get('org_documents')
    if (orgIdForDocs) {
      const { data: docs, error: docError } = await serviceClient
        .from('compliance_documents')
        .select('id, document_type, file_name, file_path, file_size_bytes, mime_type, status, rejection_reason, created_at')
        .eq('organization_id', orgIdForDocs)
        .order('created_at', { ascending: false })

      if (docError) {
        return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
      }

      // Generate short-lived signed URLs (5 minutes)
      const documentsWithUrls = await Promise.all(
        (docs || []).map(async (doc) => {
          const { data: signedUrl } = await serviceClient.storage
            .from('compliance-documents')
            .createSignedUrl(doc.file_path, 300) // 5 minutes

          return {
            ...doc,
            file_path: undefined, // never expose raw path
            signed_url: signedUrl?.signedUrl || null,
          }
        })
      )

      return NextResponse.json({ documents: documentsWithUrls })
    }

    let query = serviceClient
      .from('organizations')
      .select('id, name, slug, kyc_status, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, business_type, legal_name, primary_contact_email, created_at')
      .order('kyc_submitted_at', { ascending: false, nullsFirst: false })

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('kyc_status', statusFilter)
    }

    const { data: orgs, error } = await query.limit(100)

    if (error) {
      return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 })
    }

    // Load document counts per org
    const orgIds = (orgs || []).map((o) => o.id)
    let docCounts: Record<string, number> = {}

    if (orgIds.length > 0) {
      const { data: docs } = await serviceClient
        .from('compliance_documents')
        .select('organization_id')
        .in('organization_id', orgIds)

      if (docs) {
        for (const doc of docs) {
          docCounts[doc.organization_id] = (docCounts[doc.organization_id] || 0) + 1
        }
      }
    }

    return NextResponse.json({
      organizations: (orgs || []).map((org) => ({
        ...org,
        document_count: docCounts[org.id] || 0,
      })),
    })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/admin/compliance' }
)

export const POST = createApiHandler(
  async (request, { user }) => {
    const membership = await requirePlatformAdmin(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: body, error: parseError } = await parseJsonBody<{
      action: 'approve' | 'reject'
      organization_id: string
      rejection_reason?: string
    }>(request)

    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    if (!body.organization_id || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json({ error: 'organization_id and action (approve/reject) required' }, { status: 400 })
    }

    if (body.action === 'reject' && !body.rejection_reason?.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()

    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .select('id, kyc_status, name')
      .eq('id', body.organization_id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (body.action === 'approve') {
      const { error: updateError } = await serviceClient
        .from('organizations')
        .update({
          kyc_status: 'approved',
          kyc_reviewed_at: new Date().toISOString(),
          kyc_reviewed_by: user!.id,
          kyc_rejection_reason: null,
        })
        .eq('id', body.organization_id)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to approve' }, { status: 500 })
      }

      // Generate live API key if the org's live ledger doesn't have one
      const { data: liveLedger } = await serviceClient
        .from('ledgers')
        .select('id, api_key_hash')
        .eq('organization_id', body.organization_id)
        .eq('livemode', true)
        .eq('status', 'active')
        .maybeSingle()

      let generatedLiveKey: string | null = null
      if (liveLedger && !liveLedger.api_key_hash) {
        const liveKey = makeApiKey(true)
        const liveKeyHash = hashApiKey(liveKey)
        generatedLiveKey = liveKey

        await serviceClient
          .from('ledgers')
          .update({ api_key_hash: liveKeyHash })
          .eq('id', liveLedger.id)

        // Best-effort api_keys record
        try {
          await serviceClient.from('api_keys').insert({
            ledger_id: liveLedger.id,
            name: 'Default Live Key',
            key_hash: liveKeyHash,
            key_prefix: liveKey.slice(0, 12),
            scopes: ['read', 'write', 'admin'],
            created_by: user!.id,
          })
        } catch {
          // Non-blocking
        }
      }

      // Audit log
      try {
        await serviceClient.from('audit_log').insert({
          ledger_id: null,
          action: 'kyc_approved',
          entity_type: 'organization',
          entity_id: body.organization_id,
          actor_type: 'user',
          actor_id: user!.id,
          request_body: { organization_id: body.organization_id, organization_name: org.name },
          response_status: 200,
          risk_score: 30,
        })
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        kyc_status: 'approved',
        live_key_generated: Boolean(generatedLiveKey),
      })
    }

    // Reject
    const { error: updateError } = await serviceClient
      .from('organizations')
      .update({
        kyc_status: 'rejected',
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reviewed_by: user!.id,
        kyc_rejection_reason: body.rejection_reason!.trim(),
      })
      .eq('id', body.organization_id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to reject' }, { status: 500 })
    }

    // Audit log
    try {
      await serviceClient.from('audit_log').insert({
        ledger_id: null,
        action: 'kyc_rejected',
        entity_type: 'organization',
        entity_id: body.organization_id,
        actor_type: 'user',
        actor_id: user!.id,
        request_body: {
          organization_id: body.organization_id,
          organization_name: org.name,
          rejection_reason: body.rejection_reason!.trim(),
        },
        response_status: 200,
        risk_score: 30,
      })
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true, kyc_status: 'rejected' })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/admin/compliance' }
)
