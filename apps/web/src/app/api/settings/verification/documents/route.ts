import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const DOCUMENT_TYPES = ['ein_letter', 'articles_of_incorporation', 'government_id', 'proof_of_address', 'w9', 'other']

async function getActiveMembership(userId: string) {
  const supabase = await createClient()
  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()
  if (error || !membership) return null
  return membership
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const membership = await getActiveMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    const serviceClient = createServiceRoleClient()
    const { data: documents, error } = await serviceClient
      .from('compliance_documents')
      .select('id, document_type, file_name, file_size_bytes, mime_type, status, rejection_reason, created_at')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    return NextResponse.json({ documents: documents || [] })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/settings/verification/documents' }
)

export const POST = createApiHandler(
  async (request, { user }) => {
    const membership = await getActiveMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can upload documents' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('document_type') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!documentType || !DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, PNG, JPEG' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()
    const orgId = membership.organization_id
    const fileName = `${orgId}/${crypto.randomUUID()}-${file.name}`

    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await serviceClient.storage
      .from('compliance-documents')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    const { data: doc, error: insertError } = await serviceClient
      .from('compliance_documents')
      .insert({
        organization_id: orgId,
        document_type: documentType,
        file_path: fileName,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_by: user!.id,
      })
      .select('id, document_type, file_name, status, created_at')
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: doc })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: false, routePath: '/api/settings/verification/documents' }
)

export const DELETE = createApiHandler(
  async (request, { user }) => {
    const membership = await getActiveMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can delete documents' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()

    const { data: doc, error: fetchError } = await serviceClient
      .from('compliance_documents')
      .select('id, file_path, status')
      .eq('id', documentId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (doc.status === 'approved') {
      return NextResponse.json({ error: 'Cannot delete approved documents' }, { status: 400 })
    }

    // Delete from storage
    await serviceClient.storage.from('compliance-documents').remove([doc.file_path])

    // Delete record
    await serviceClient
      .from('compliance_documents')
      .delete()
      .eq('id', documentId)

    return NextResponse.json({ success: true })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/settings/verification/documents' }
)
