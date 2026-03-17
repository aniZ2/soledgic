'use client'

import { useState, useEffect } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { ShieldCheck, CheckCircle, Clock, XCircle, Upload, FileText, Trash2 } from 'lucide-react'

interface VerificationStatus {
  kyc_status: string
  rejection_reason: string | null
}

interface CreatorDocument {
  id: string
  document_type: string
  file_name: string
  status: string
  rejection_reason: string | null
  created_at: string
}

const DOCUMENT_TYPES = [
  { value: 'government_id', label: 'Government ID' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'w9', label: 'W-9' },
  { value: 'other', label: 'Other' },
]

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; label: string; className: string }> = {
    pending: { icon: Clock, label: 'Pending', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    under_review: { icon: Clock, label: 'Under Review', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
    approved: { icon: CheckCircle, label: 'Verified', className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
    rejected: { icon: XCircle, label: 'Rejected', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
    suspended: { icon: XCircle, label: 'Suspended', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
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

export default function CreatorVerificationPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<VerificationStatus | null>(null)
  const [documents, setDocuments] = useState<CreatorDocument[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState('government_id')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchWithCsrf('/api/creator/verification')
        const data = await res.json()
        if (data.status) setStatus(data.status)
        if (data.documents) setDocuments(data.documents)
      } catch {
        setError('Failed to load verification status')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', selectedDocType)

      const res = await fetch('/api/creator/verification/documents', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload')

      if (data.document) {
        setDocuments((prev) => [data.document, ...prev])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetchWithCsrf(`/api/creator/verification/documents?id=${docId}`, {
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse space-y-4 w-full max-w-xl">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-80 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold text-foreground">Identity Verification</h1>
      <p className="text-muted-foreground mt-2">
        Verify your identity to receive payouts. This is required by financial regulations.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status Card */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Verification Status
          </h2>
          {status && <StatusBadge status={status.kyc_status} />}
        </div>

        {status?.kyc_status === 'approved' && (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">
            Your identity has been verified. You are eligible to receive payouts.
          </p>
        )}

        {status?.kyc_status === 'pending' && (
          <p className="mt-3 text-sm text-muted-foreground">
            Upload the required documents below to start the verification process.
          </p>
        )}

        {status?.kyc_status === 'under_review' && (
          <p className="mt-3 text-sm text-blue-700 dark:text-blue-400">
            Your documents are being reviewed. This typically takes 1-2 business days.
          </p>
        )}

        {status?.kyc_status === 'rejected' && status.rejection_reason && (
          <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-md p-3">
            <p className="text-sm text-red-700 dark:text-red-400">{status.rejection_reason}</p>
            <p className="text-sm text-red-600/60 dark:text-red-400/60 mt-1">Please upload updated documents.</p>
          </div>
        )}
      </div>

      {/* Document Upload */}
      {status?.kyc_status !== 'approved' && (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Upload Documents</h2>

          <div className="flex items-end gap-3">
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
        </div>
      )}

      {/* Document List */}
      {documents.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Documents</h2>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPES.find((dt) => dt.value === doc.document_type)?.label || doc.document_type}
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
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
