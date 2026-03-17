'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { ShieldCheck, Upload, Trash2, FileText, AlertCircle, CheckCircle, Clock, XCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface VerificationData {
  kyc_status: string
  kyc_submitted_at: string | null
  kyc_reviewed_at: string | null
  kyc_rejection_reason: string | null
  has_tax_id?: boolean
  business_type: string | null
  legal_name: string | null
  tax_id: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
  business_address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  } | null
}

interface ComplianceDocument {
  id: string
  document_type: string
  file_name: string
  file_size_bytes: number | null
  status: string
  rejection_reason: string | null
  created_at: string
}

const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'nonprofit', label: 'Nonprofit' },
]

const DOCUMENT_TYPES = [
  { value: 'ein_letter', label: 'EIN Letter' },
  { value: 'articles_of_incorporation', label: 'Articles of Incorporation' },
  { value: 'government_id', label: 'Government ID' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'w9', label: 'W-9' },
  { value: 'other', label: 'Other' },
]

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; label: string; className: string }> = {
    pending: { icon: Clock, label: 'Pending', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    under_review: { icon: Clock, label: 'Under Review', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
    approved: { icon: CheckCircle, label: 'Approved', className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
    rejected: { icon: XCircle, label: 'Rejected', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
    suspended: { icon: AlertCircle, label: 'Suspended', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
  }
  const c = config[status] || config.pending
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${c.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </span>
  )
}

export default function VerificationSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [verification, setVerification] = useState<VerificationData | null>(null)
  const [documents, setDocuments] = useState<ComplianceDocument[]>([])

  // Editable fields
  const [businessType, setBusinessType] = useState('')
  const [legalName, setLegalName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')

  // Document upload
  const [selectedDocType, setSelectedDocType] = useState('ein_letter')

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [verRes, docRes] = await Promise.all([
        fetchWithCsrf('/api/settings/verification'),
        fetchWithCsrf('/api/settings/verification/documents'),
      ])

      const verData = await verRes.json()
      const docData = await docRes.json()

      if (verData.verification) {
        const v = verData.verification
        setVerification(v)
        setBusinessType(v.business_type || '')
        setLegalName(v.legal_name || '')
        // Don't populate edit field with masked value — leave empty so user re-enters if needed
        setTaxId('')
        setContactName(v.primary_contact_name || '')
        setContactEmail(v.primary_contact_email || '')
        setContactPhone(v.primary_contact_phone || '')
        setAddressLine1(v.business_address?.line1 || '')
        setAddressLine2(v.business_address?.line2 || '')
        setCity(v.business_address?.city || '')
        setState(v.business_address?.state || '')
        setZip(v.business_address?.zip || '')
        setCountry(v.business_address?.country || 'US')
      }

      if (docData.documents) {
        setDocuments(docData.documents)
      }
    } catch {
      setError('Failed to load verification data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetchWithCsrf('/api/settings/verification', {
        method: 'PUT',
        body: JSON.stringify({
          business_type: businessType || null,
          legal_name: legalName.trim() || null,
          tax_id: taxId.trim() || null,
          primary_contact_name: contactName.trim() || null,
          primary_contact_email: contactEmail.trim() || null,
          primary_contact_phone: contactPhone.trim() || null,
          business_address: {
            line1: addressLine1.trim() || undefined,
            line2: addressLine2.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            zip: zip.trim() || undefined,
            country: country.trim() || undefined,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      setSuccess('Business information saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetchWithCsrf('/api/settings/verification', {
        method: 'POST',
        body: JSON.stringify({ action: 'submit_for_review' }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')

      setVerification((prev) => prev ? { ...prev, kyc_status: 'under_review' } : prev)
      setSuccess('Submitted for review')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', selectedDocType)

      const res = await fetch('/api/settings/verification/documents', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload')

      if (data.document) {
        setDocuments((prev) => [data.document, ...prev])
      }
      setSuccess('Document uploaded')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    setError(null)
    try {
      const res = await fetchWithCsrf(`/api/settings/verification/documents?id=${docId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 max-w-2xl">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-4 w-96 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  const isEditable = !verification?.kyc_status || verification.kyc_status === 'pending' || verification.kyc_status === 'rejected'
  const canSubmit = isEditable && businessType && legalName.trim() && contactName.trim() && contactEmail.trim()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Verification</h1>
          <p className="text-muted-foreground mt-1">
            Business verification is required before going live
          </p>
        </div>
        {verification && <StatusBadge status={verification.kyc_status} />}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3 mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 text-sm rounded-md p-3 mb-6">
          {success}
        </div>
      )}

      {verification?.kyc_status === 'rejected' && verification.kyc_rejection_reason && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-4 mb-6">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Verification Rejected</p>
              <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">{verification.kyc_rejection_reason}</p>
              <p className="text-sm text-red-600/60 dark:text-red-400/60 mt-2">Please update your information and resubmit.</p>
            </div>
          </div>
        </div>
      )}

      {/* Business Information */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Business Information
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Business type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              disabled={!isEditable}
              className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60"
            >
              <option value="">Select business type</option>
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Legal name</label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              disabled={!isEditable}
              className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60"
              placeholder="Full legal business name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">EIN / Tax ID</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              disabled={!isEditable}
              className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60"
              placeholder={verification?.has_tax_id ? 'On file (enter new value to update)' : 'XX-XXXXXXX'}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Business address</label>
            <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Address line 1" />
            <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Address line 2 (optional)" />
            <div className="grid grid-cols-3 gap-3">
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="City" />
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="State" />
              <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="ZIP" />
            </div>
            <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Country" />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Primary contact</label>
            <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Full name" />
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Email address" />
            <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={!isEditable} className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60" placeholder="Phone number (optional)" />
          </div>

          {isEditable && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-primary-foreground rounded-md py-2 px-4 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleSubmitForReview}
                disabled={submitting || !canSubmit}
                className="border border-primary text-primary rounded-md py-2 px-4 text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Compliance Documents
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload supporting documents for your business verification. Accepted formats: PDF, PNG, JPEG (max 10MB).
        </p>

        {/* Upload */}
        <div className="flex items-end gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1.5">Document type</label>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <span className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md py-2 px-4 text-sm font-medium hover:bg-primary/90 transition-colors">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload'}
            </span>
          </label>
        </div>

        {/* Document list */}
        {documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPES.find((dt) => dt.value === doc.document_type)?.label || doc.document_type}
                      {doc.file_size_bytes ? ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ''}
                    </p>
                    {doc.rejection_reason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{doc.rejection_reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.status !== 'approved' && (
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
