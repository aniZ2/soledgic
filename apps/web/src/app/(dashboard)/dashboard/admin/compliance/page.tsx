'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { ShieldCheck, CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface OrgCompliance {
  id: string
  name: string
  slug: string
  kyc_status: string
  kyc_submitted_at: string | null
  kyc_reviewed_at: string | null
  kyc_rejection_reason: string | null
  business_type: string | null
  legal_name: string | null
  primary_contact_email: string | null
  created_at: string
  document_count: number
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
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
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

export default function AdminCompliancePage() {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<OrgCompliance[]>([])
  const [statusFilter, setStatusFilter] = useState('under_review')
  const [error, setError] = useState<string | null>(null)
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const loadOrgs = useCallback(async () => {
    setError(null)
    try {
      const res = await fetchWithCsrf(`/api/admin/compliance?status=${statusFilter}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setOrgs(data.organizations || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    setLoading(true)
    void loadOrgs()
  }, [loadOrgs])

  const handleAction = async (orgId: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectionReason.trim()) {
      setError('Please provide a rejection reason')
      return
    }

    setActionLoading(orgId)
    setError(null)

    try {
      const res = await fetchWithCsrf('/api/admin/compliance', {
        method: 'POST',
        body: JSON.stringify({
          action,
          organization_id: orgId,
          rejection_reason: action === 'reject' ? rejectionReason.trim() : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`)

      // Update local state
      setOrgs((prev) =>
        prev.map((org) =>
          org.id === orgId ? { ...org, kyc_status: data.kyc_status } : org
        )
      )
      setExpandedOrg(null)
      setRejectionReason('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            KYC/KYB Review
          </h1>
          <p className="text-muted-foreground mt-1">Review and approve organization verifications</p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3 mb-6">
          {error}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No organizations with this status</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <div key={org.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-foreground text-left">{org.name}</p>
                    <p className="text-sm text-muted-foreground text-left">
                      {org.legal_name || org.slug}
                      {org.primary_contact_email ? ` · ${org.primary_contact_email}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{org.document_count} docs</span>
                  <StatusBadge status={org.kyc_status} />
                  {expandedOrg === org.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {expandedOrg === org.id && (
                <div className="border-t border-border p-4 bg-muted/30">
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-muted-foreground">Business Type</p>
                      <p className="font-medium text-foreground capitalize">{org.business_type || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Legal Name</p>
                      <p className="font-medium text-foreground">{org.legal_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Submitted</p>
                      <p className="font-medium text-foreground">
                        {org.kyc_submitted_at
                          ? new Date(org.kyc_submitted_at).toLocaleDateString()
                          : 'Not submitted'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-medium text-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {org.kyc_rejection_reason && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 mb-4">
                      <p className="text-sm text-red-700 dark:text-red-400">
                        <strong>Previous rejection:</strong> {org.kyc_rejection_reason}
                      </p>
                    </div>
                  )}

                  {(org.kyc_status === 'under_review' || org.kyc_status === 'pending') && (
                    <div className="flex items-end gap-3">
                      <button
                        onClick={() => handleAction(org.id, 'approve')}
                        disabled={actionLoading === org.id}
                        className="inline-flex items-center gap-2 bg-green-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {actionLoading === org.id ? 'Processing...' : 'Approve'}
                      </button>

                      <div className="flex-1 flex items-end gap-2">
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Rejection reason..."
                          className="flex-1 border border-border rounded-md py-2 px-3 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <button
                          onClick={() => handleAction(org.id, 'reject')}
                          disabled={actionLoading === org.id || !rejectionReason.trim()}
                          className="inline-flex items-center gap-2 bg-red-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
