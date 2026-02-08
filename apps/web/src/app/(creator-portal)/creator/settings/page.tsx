'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle, AlertCircle, User, CreditCard, FileText } from 'lucide-react'

interface TaxInfo {
  tax_id_type: 'ssn' | 'ein' | 'itin' | ''
  tax_id_last4: string
  legal_name: string
  business_type: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
  address: {
    line1: string
    line2: string
    city: string
    state: string
    postal_code: string
    country: string
  }
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]

export default function CreatorSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Profile
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')

  // Tax info
  const [taxInfo, setTaxInfo] = useState<TaxInfo>({
    tax_id_type: '',
    tax_id_last4: '',
    legal_name: '',
    business_type: 'individual',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US'
    }
  })

  // Connected accounts
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession(); const user = session?.user

    if (!user) {
      router.push('/creator/login')
      return
    }

    setEmail(user.email || '')
    setDisplayName(user.user_metadata?.full_name || '')

    // Get connected accounts
    const { data: accounts } = await supabase
      .from('connected_accounts')
      .select(`
        id,
        ledger_id,
        entity_id,
        display_name,
        stripe_status,
        payouts_enabled,
        default_bank_last4,
        default_bank_name,
        ledger:ledgers(business_name)
      `)
      .eq('email', user.email)
      .eq('is_active', true)

    if (accounts && accounts.length > 0) {
      setConnectedAccounts(accounts)

      // Get tax info from first account's creator account metadata
      const { data: creatorAccount } = await supabase
        .from('accounts')
        .select('metadata')
        .eq('ledger_id', accounts[0].ledger_id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', accounts[0].entity_id)
        .single()

      if (creatorAccount?.metadata?.tax_info) {
        setTaxInfo(creatorAccount.metadata.tax_info)
      }
    }

    setLoading(false)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const supabase = createClient()

    const { error: updateError } = await supabase.auth.updateUser({
      data: { full_name: displayName }
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess('Profile updated successfully')
    }

    setSaving(false)
  }

  const handleSaveTaxInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const supabase = createClient()

    // Update tax info in all connected creator accounts
    for (const account of connectedAccounts) {
      const { data: creatorAccount } = await supabase
        .from('accounts')
        .select('id, metadata')
        .eq('ledger_id', account.ledger_id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', account.entity_id)
        .single()

      if (creatorAccount) {
        await supabase
          .from('accounts')
          .update({
            metadata: {
              ...creatorAccount.metadata,
              tax_info: taxInfo
            }
          })
          .eq('id', creatorAccount.id)
      }
    }

    setSuccess('Tax information saved successfully')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile and tax information
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-8">
        {/* Profile Section */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Contact support to change your email address.
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Profile
            </button>
          </form>
        </div>

        {/* Tax Information Section */}
        <div id="tax" className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Tax Information (W-9)</h2>
          </div>
          <form onSubmit={handleSaveTaxInfo} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Legal Name
                </label>
                <input
                  type="text"
                  value={taxInfo.legal_name}
                  onChange={(e) => setTaxInfo({ ...taxInfo, legal_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="As it appears on your tax return"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Business Type
                </label>
                <select
                  value={taxInfo.business_type}
                  onChange={(e) => setTaxInfo({ ...taxInfo, business_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="individual">Individual/Sole Proprietor</option>
                  <option value="llc">LLC</option>
                  <option value="corporation">Corporation</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tax ID Type
                </label>
                <select
                  value={taxInfo.tax_id_type}
                  onChange={(e) => setTaxInfo({ ...taxInfo, tax_id_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select type</option>
                  <option value="ssn">SSN (Social Security Number)</option>
                  <option value="ein">EIN (Employer Identification Number)</option>
                  <option value="itin">ITIN (Individual Taxpayer ID)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tax ID (Last 4 digits only)
                </label>
                <input
                  type="text"
                  value={taxInfo.tax_id_last4}
                  onChange={(e) => setTaxInfo({ ...taxInfo, tax_id_last4: e.target.value.slice(0, 4) })}
                  maxLength={4}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="1234"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  For security, we only store the last 4 digits.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                value={taxInfo.address.line1}
                onChange={(e) => setTaxInfo({ ...taxInfo, address: { ...taxInfo.address, line1: e.target.value } })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="123 Main St"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Address Line 2 <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                value={taxInfo.address.line2}
                onChange={(e) => setTaxInfo({ ...taxInfo, address: { ...taxInfo.address, line2: e.target.value } })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Apt 4B"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-foreground mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={taxInfo.address.city}
                  onChange={(e) => setTaxInfo({ ...taxInfo, address: { ...taxInfo.address, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  State
                </label>
                <select
                  value={taxInfo.address.state}
                  onChange={(e) => setTaxInfo({ ...taxInfo, address: { ...taxInfo.address, state: e.target.value } })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">--</option>
                  {US_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  value={taxInfo.address.postal_code}
                  onChange={(e) => setTaxInfo({ ...taxInfo, address: { ...taxInfo.address, postal_code: e.target.value } })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  maxLength={10}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Tax Information
            </button>
          </form>
        </div>

        {/* Connected Platforms */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Connected Platforms</h2>
          </div>
          <div className="divide-y divide-border">
            {connectedAccounts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No platforms connected yet.
              </div>
            ) : (
              connectedAccounts.map((account) => (
                <div key={account.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {(account.ledger as any)?.business_name || 'Unknown Platform'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Status: {account.stripe_status || 'pending'}
                    </p>
                  </div>
                  <div className="text-right">
                    {account.default_bank_last4 ? (
                      <p className="text-sm text-foreground">
                        {account.default_bank_name} ****{account.default_bank_last4}
                      </p>
                    ) : (
                      <p className="text-sm text-amber-600">No bank connected</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
