'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Loader2,
  UserCheck,
  Building2,
  User,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────

type CreatorResult = {
  found: boolean
  displayName?: string
  entityId?: string
  hasTaxInfo: boolean
}

type OrgResult = {
  found: boolean
  orgName?: string
  orgId?: string
  kycStatus?: string
  hasTaxId: boolean
}

type VerifyOutcome = {
  nameMatch: boolean | null
  tinMatch: boolean | null
  zipMatch?: boolean | null
}

// ── Main Page ──────────────────────────────────────────

export default function VerifyPage() {
  const [tab, setTab] = useState<'creator' | 'org'>('creator')

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <UserCheck className="w-6 h-6" />
          Identity Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify a creator or organization&apos;s identity. No PII is displayed — only match/no-match results.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
        <button
          onClick={() => setTab('creator')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'creator'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="w-4 h-4" />
          Creator
        </button>
        <button
          onClick={() => setTab('org')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'org'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Organization
        </button>
      </div>

      {tab === 'creator' ? <CreatorVerify /> : <OrgVerify />}
    </div>
  )
}

// ── Creator Verification ───────────────────────────────

function CreatorVerify() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [creator, setCreator] = useState<CreatorResult | null>(null)
  const [legalNameInput, setLegalNameInput] = useState('')
  const [tinInput, setTinInput] = useState('')
  const [zipInput, setZipInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<VerifyOutcome | null>(null)

  const search = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setCreator(null)
    setResult(null)
    setLegalNameInput('')
    setTinInput('')
    setZipInput('')

    try {
      const supabase = createClient()
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, entity_id, name, ledger_id')
        .eq('account_type', 'creator_balance')
        .eq('is_active', true)
        .or(`entity_id.eq.${q},name.ilike.%${q}%`)
        .limit(1)

      if (!accounts || accounts.length === 0) {
        setCreator({ found: false, hasTaxInfo: false })
        return
      }

      const account = accounts[0]
      const { count } = await supabase
        .from('tax_info_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('ledger_id', account.ledger_id)
        .eq('entity_id', account.entity_id)
        .eq('status', 'active')

      setCreator({
        found: true,
        displayName: account.name,
        entityId: account.entity_id,
        hasTaxInfo: (count ?? 0) > 0,
      })
    } catch {
      setCreator({ found: false, hasTaxInfo: false })
    } finally {
      setSearching(false)
    }
  }

  const verify = async () => {
    if (!creator?.found || !creator.entityId) return
    if (!legalNameInput.trim() && !tinInput.trim() && !zipInput.trim()) return
    setVerifying(true)
    setResult(null)

    try {
      const supabase = createClient()
      const { data: taxInfo } = await supabase
        .from('tax_info_submissions')
        .select('legal_name, tax_id_last4, address_postal_code')
        .eq('entity_id', creator.entityId)
        .eq('status', 'active')
        .limit(1)
        .single()

      if (!taxInfo) {
        setResult({ nameMatch: null, tinMatch: null })
        return
      }

      setResult({
        nameMatch: legalNameInput.trim()
          ? taxInfo.legal_name.toLowerCase().trim() === legalNameInput.toLowerCase().trim()
          : null,
        tinMatch: tinInput.trim()
          ? taxInfo.tax_id_last4 === tinInput.trim()
          : null,
        zipMatch: zipInput.trim()
          ? (taxInfo.address_postal_code ?? '').trim() === zipInput.trim()
          : null,
      })
    } catch {
      setResult({ nameMatch: null, tinMatch: null })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <SearchBox
        placeholder="Enter entity ID or creator display name"
        value={searchQuery}
        onChange={setSearchQuery}
        onSearch={search}
        searching={searching}
      />

      {creator && !creator.found && <NotFound query={searchQuery} label="creator" />}

      {creator?.found && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{creator.displayName}</h3>
                <code className="text-xs text-muted-foreground">{creator.entityId}</code>
              </div>
              <StatusBadge ok={creator.hasTaxInfo} okLabel="Tax info on file" failLabel="No tax info" />
            </div>
          </div>

          {creator.hasTaxInfo ? (
            <VerifyForm
              fields={[
                { label: 'Legal Name (as on W-9)', value: legalNameInput, onChange: setLegalNameInput, placeholder: 'e.g. John Smith' },
                { label: 'Last 4 of TIN', value: tinInput, onChange: (v) => setTinInput(v.replace(/\D/g, '').slice(0, 4)), placeholder: 'e.g. 4567', maxLength: 4 },
                { label: 'Postal Code', value: zipInput, onChange: (v) => setZipInput(v.replace(/[^\d-]/g, '').slice(0, 10)), placeholder: 'e.g. 90210', maxLength: 10 },
              ]}
              onVerify={verify}
              verifying={verifying}
              disabled={!legalNameInput.trim() && !tinInput.trim() && !zipInput.trim()}
              result={result ? {
                nameMatch: result.nameMatch,
                tinMatch: result.tinMatch,
                extraResults: result.zipMatch !== null && result.zipMatch !== undefined
                  ? [{ label: 'Postal code', match: result.zipMatch }]
                  : undefined,
              } : null}
              resultLabels={{ name: 'Legal name', tin: 'Last 4 of TIN' }}
            />
          ) : (
            <NoInfoBanner entity="creator" />
          )}
        </div>
      )}
    </>
  )
}

// ── Organization Verification ──────────────────────────

function OrgVerify() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [org, setOrg] = useState<OrgResult | null>(null)
  const [businessNameInput, setBusinessNameInput] = useState('')
  const [taxIdInput, setTaxIdInput] = useState('')
  const [billingEmailInput, setBillingEmailInput] = useState('')
  const [zipInput, setZipInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ nameMatch: boolean | null; taxIdMatch: boolean | null; emailMatch: boolean | null; zipMatch: boolean | null } | null>(null)

  const search = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setOrg(null)
    setResult(null)
    setBusinessNameInput('')
    setTaxIdInput('')
    setBillingEmailInput('')
    setZipInput('')

    try {
      const supabase = createClient()
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, slug, kyc_status, tax_id, billing_email')
        .or(`slug.eq.${q},name.ilike.%${q}%,id.eq.${q}`)
        .limit(1)

      if (!orgs || orgs.length === 0) {
        setOrg({ found: false, hasTaxId: false })
        return
      }

      const o = orgs[0]
      setOrg({
        found: true,
        orgName: o.name,
        orgId: o.id,
        kycStatus: o.kyc_status,
        hasTaxId: !!o.tax_id || !!o.billing_email,
      })
    } catch {
      setOrg({ found: false, hasTaxId: false })
    } finally {
      setSearching(false)
    }
  }

  const verify = async () => {
    if (!org?.found || !org.orgId) return
    if (!businessNameInput.trim() && !taxIdInput.trim() && !billingEmailInput.trim() && !zipInput.trim()) return
    setVerifying(true)
    setResult(null)

    try {
      const supabase = createClient()
      // Fetch only the fields needed for comparison — never displayed
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name, tax_id, billing_email, billing_address')
        .eq('id', org.orgId)
        .single()

      if (!orgData) {
        setResult({ nameMatch: null, taxIdMatch: null, emailMatch: null, zipMatch: null })
        return
      }

      const addr = orgData.billing_address as Record<string, string> | null

      setResult({
        nameMatch: businessNameInput.trim()
          ? orgData.name.toLowerCase().trim() === businessNameInput.toLowerCase().trim()
          : null,
        taxIdMatch: taxIdInput.trim()
          ? (orgData.tax_id ?? '').endsWith(taxIdInput.trim())
          : null,
        emailMatch: billingEmailInput.trim()
          ? (orgData.billing_email ?? '').toLowerCase().trim() === billingEmailInput.toLowerCase().trim()
          : null,
        zipMatch: zipInput.trim()
          ? (addr?.zip ?? addr?.postal_code ?? '').trim() === zipInput.trim()
          : null,
      })
    } catch {
      setResult({ nameMatch: null, taxIdMatch: null, emailMatch: null, zipMatch: null })
    } finally {
      setVerifying(false)
    }
  }

  const kycBadge = org?.kycStatus ? {
    approved: 'bg-green-500/10 text-green-600',
    pending: 'bg-yellow-500/10 text-yellow-600',
    under_review: 'bg-blue-500/10 text-blue-600',
    rejected: 'bg-red-500/10 text-red-600',
    suspended: 'bg-red-500/10 text-red-600',
  }[org.kycStatus] ?? 'bg-muted text-muted-foreground' : ''

  return (
    <>
      <SearchBox
        placeholder="Enter org name, slug, or ID"
        value={searchQuery}
        onChange={setSearchQuery}
        onSearch={search}
        searching={searching}
      />

      {org && !org.found && <NotFound query={searchQuery} label="organization" />}

      {org?.found && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{org.orgName}</h3>
                <code className="text-xs text-muted-foreground">{org.orgId?.slice(0, 8)}...</code>
              </div>
              <div className="flex items-center gap-2">
                {org.kycStatus && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${kycBadge}`}>
                    KYB: {org.kycStatus}
                  </span>
                )}
                <StatusBadge ok={org.hasTaxId} okLabel="Billing info on file" failLabel="No billing info" />
              </div>
            </div>
          </div>

          <VerifyForm
            fields={[
              { label: 'Business Name', value: businessNameInput, onChange: setBusinessNameInput, placeholder: 'e.g. Acme Inc.' },
              { label: 'Last 4 of Tax ID / EIN', value: taxIdInput, onChange: (v) => setTaxIdInput(v.replace(/\D/g, '').slice(0, 4)), placeholder: 'e.g. 7890', maxLength: 4 },
              { label: 'Billing Email', value: billingEmailInput, onChange: setBillingEmailInput, placeholder: 'e.g. billing@acme.com', type: 'email' },
              { label: 'Billing Zip Code', value: zipInput, onChange: (v) => setZipInput(v.replace(/[^\d-]/g, '').slice(0, 10)), placeholder: 'e.g. 90210', maxLength: 10 },
            ]}
            onVerify={verify}
            verifying={verifying}
            disabled={!businessNameInput.trim() && !taxIdInput.trim() && !billingEmailInput.trim() && !zipInput.trim()}
            result={result ? {
              nameMatch: result.nameMatch,
              tinMatch: result.taxIdMatch,
              extraResults: [
                ...(result.emailMatch !== null ? [{ label: 'Billing email', match: result.emailMatch }] : []),
                ...(result.zipMatch !== null ? [{ label: 'Billing zip code', match: result.zipMatch }] : []),
              ],
            } : null}
            resultLabels={{ name: 'Business name', tin: 'Last 4 of Tax ID' }}
          />
        </div>
      )}
    </>
  )
}

// ── Shared Components ──────────────────────────────────

function SearchBox({
  placeholder,
  value,
  onChange,
  onSearch,
  searching,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  searching: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
        />
        <button
          onClick={onSearch}
          disabled={searching || !value.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
      <ShieldCheck className="w-3.5 h-3.5" />
      {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
      <XCircle className="w-3.5 h-3.5" />
      {failLabel}
    </span>
  )
}

function NotFound({ query, label }: { query: string; label: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 text-center">
      <XCircle className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
      <p className="text-muted-foreground">No {label} found matching &quot;{query}&quot;</p>
    </div>
  )
}

function NoInfoBanner({ entity }: { entity: string }) {
  return (
    <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-4">
      <p className="text-sm text-yellow-800 dark:text-yellow-300">
        This {entity} has no tax information on file. Identity verification is not available until they submit their info.
      </p>
    </div>
  )
}

function VerifyForm({
  fields,
  onVerify,
  verifying,
  disabled,
  result,
  resultLabels,
}: {
  fields: Array<{ label: string; value: string; onChange: (v: string) => void; placeholder: string; maxLength?: number; type?: string }>
  onVerify: () => void
  verifying: boolean
  disabled: boolean
  result: { nameMatch: boolean | null; tinMatch: boolean | null; extraResults?: Array<{ label: string; match: boolean }> } | null
  resultLabels: { name: string; tin: string }
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="font-semibold text-foreground mb-4">Verify Identity</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Enter what they provided. The system confirms match/no-match without showing stored values.
      </p>

      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="block text-sm font-medium text-foreground mb-1">{f.label}</label>
            <input
              type={f.type ?? 'text'}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
            />
          </div>
        ))}

        <button
          onClick={onVerify}
          disabled={verifying || disabled}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
      </div>

      {result && (
        <div className="mt-6 space-y-3">
          {result.nameMatch !== null && (
            <MatchResult match={result.nameMatch} label={resultLabels.name} />
          )}
          {result.tinMatch !== null && (
            <MatchResult match={result.tinMatch} label={resultLabels.tin} />
          )}
          {result.extraResults?.map((r) => (
            <MatchResult key={r.label} match={r.match} label={r.label} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchResult({ match, label }: { match: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${
      match
        ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20'
        : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
    }`}>
      {match ? (
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
      )}
      <span className={`text-sm font-medium ${
        match ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
      }`}>
        {label} {match ? 'matches' : 'does not match'}
      </span>
    </div>
  )
}
