import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { getActiveOrganizationMembership } from '@/lib/active-org'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { maskTaxId, isKycApproved } from '@/lib/kyc-status'

export const GET = createApiHandler(
  async (_request, { user }) => {
    const membership = await getActiveOrganizationMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    const serviceClient = createServiceRoleClient()
    const { data: org, error } = await serviceClient
      .from('organizations')
      .select(
        'kyc_status, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, business_type, legal_name, tax_id, primary_contact_name, primary_contact_email, primary_contact_phone, business_address'
      )
      .eq('id', membership.organization_id)
      .single()

    if (error || !org) {
      return NextResponse.json({ error: 'Failed to load verification data' }, { status: 500 })
    }

    // Never expose raw tax_id — mask for display
    return NextResponse.json({
      verification: {
        ...org,
        tax_id: maskTaxId(org.tax_id),
        has_tax_id: Boolean(org.tax_id),
      },
    })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/settings/verification' }
)

export const PUT = createApiHandler(
  async (request, { user }) => {
    const membership = await getActiveOrganizationMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can update verification info' }, { status: 403 })
    }

    const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()

    // Block edits while under review or already approved
    const { data: currentOrg } = await serviceClient
      .from('organizations')
      .select('kyc_status')
      .eq('id', membership.organization_id)
      .single()

    if (currentOrg?.kyc_status === 'under_review') {
      return NextResponse.json(
        { error: 'Cannot modify business information while verification is under review' },
        { status: 400 }
      )
    }

    if (isKycApproved(currentOrg?.kyc_status)) {
      return NextResponse.json(
        { error: 'Cannot modify business information after approval. Contact support for changes.' },
        { status: 400 }
      )
    }

    const allowedFields = [
      'business_type', 'legal_name', 'tax_id',
      'primary_contact_name', 'primary_contact_email', 'primary_contact_phone',
      'business_address',
    ]

    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        // Skip tax_id if it looks masked (contains asterisks) — don't overwrite real value
        if (field === 'tax_id' && typeof body[field] === 'string' && (body[field] as string).includes('*')) {
          continue
        }
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }

    const { error } = await serviceClient
      .from('organizations')
      .update(updates)
      .eq('id', membership.organization_id)

    if (error) {
      return NextResponse.json({ error: 'Failed to update verification info' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/settings/verification' }
)

export const POST = createApiHandler(
  async (request, { user }) => {
    const membership = await getActiveOrganizationMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can submit for review' }, { status: 403 })
    }

    const { data: body, error: parseError } = await parseJsonBody<{ action: string }>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    if (body.action !== 'submit_for_review') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()

    // Verify required fields are present
    const { data: org } = await serviceClient
      .from('organizations')
      .select('kyc_status, business_type, legal_name, primary_contact_name, primary_contact_email')
      .eq('id', membership.organization_id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (isKycApproved(org.kyc_status)) {
      return NextResponse.json({ error: 'Already approved' }, { status: 400 })
    }

    if (org.kyc_status === 'under_review') {
      return NextResponse.json({ error: 'Already under review' }, { status: 400 })
    }

    if (!org.business_type || !org.legal_name || !org.primary_contact_name || !org.primary_contact_email) {
      return NextResponse.json(
        { error: 'Please complete all required business information before submitting' },
        { status: 400 }
      )
    }

    const { error } = await serviceClient
      .from('organizations')
      .update({
        kyc_status: 'under_review',
        kyc_submitted_at: new Date().toISOString(),
      })
      .eq('id', membership.organization_id)

    if (error) {
      return NextResponse.json({ error: 'Failed to submit for review' }, { status: 500 })
    }

    // Audit log
    try {
      await serviceClient.from('audit_log').insert({
        ledger_id: null,
        action: 'kyc_submitted',
        entity_type: 'organization',
        entity_id: membership.organization_id,
        actor_type: 'user',
        actor_id: user!.id,
        request_body: { organization_id: membership.organization_id },
        response_status: 200,
        risk_score: 10,
      })
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true, kyc_status: 'under_review' })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/settings/verification' }
)
