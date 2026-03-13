'use client'

import { useState } from 'react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface TaxInfoFormProps {
  ledgerId: string
  creatorId: string
  onSuccess: () => void
}

const TAX_ID_TYPES = [
  { value: 'ssn', label: 'SSN (Social Security Number)' },
  { value: 'ein', label: 'EIN (Employer Identification Number)' },
  { value: 'itin', label: 'ITIN (Individual Taxpayer Identification Number)' },
]

const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
]

export function TaxInfoForm({ ledgerId, creatorId, onSuccess }: TaxInfoFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [legalName, setLegalName] = useState('')
  const [taxIdType, setTaxIdType] = useState('ssn')
  const [taxIdLast4, setTaxIdLast4] = useState('')
  const [businessType, setBusinessType] = useState('individual')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [certified, setCertified] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!legalName.trim()) {
      setError('Legal name is required')
      return
    }
    if (!/^\d{4}$/.test(taxIdLast4)) {
      setError('Enter exactly the last 4 digits of the TIN')
      return
    }
    if (!certified) {
      setError('You must certify the information is correct')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await callLedgerFunction('submit-tax-info', {
        ledgerId,
        body: {
          participant_id: creatorId,
          legal_name: legalName.trim(),
          tax_id_type: taxIdType,
          tax_id_last4: taxIdLast4,
          business_type: businessType,
          address: {
            line1: addressLine1.trim() || undefined,
            line2: addressLine2.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            postal_code: postalCode.trim() || undefined,
          },
          certify: true,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to submit tax info')
      }

      onSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit tax info'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50'
  const labelClass = 'block text-sm font-medium text-muted-foreground mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Legal Name *</label>
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Full legal name or business name"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass}>Business Type *</label>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className={inputClass}
          >
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt.value} value={bt.value}>
                {bt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Tax ID Type *</label>
          <select
            value={taxIdType}
            onChange={(e) => setTaxIdType(e.target.value)}
            className={inputClass}
          >
            {TAX_ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Last 4 Digits of TIN *</label>
          <input
            type="text"
            value={taxIdLast4}
            onChange={(e) => setTaxIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            maxLength={4}
            pattern="\d{4}"
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Only the last 4 digits are stored. Full TIN is never sent to Soledgic.
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-muted-foreground mb-3">Address (optional)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Street Address</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="123 Main St"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Apt / Suite / Unit</label>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Suite 100"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="CA"
              maxLength={2}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>ZIP Code</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="90210"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={certified}
            onChange={(e) => setCertified(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border"
          />
          <span className="text-sm text-foreground">
            Under penalties of perjury, I certify that the information provided is correct and that I am the person
            named above (or authorized to sign for the entity).
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Tax Info'}
        </button>
      </div>
    </form>
  )
}
