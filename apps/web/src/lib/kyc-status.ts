/**
 * KYC/KYB status helpers.
 */

export function isKycApproved(status: string | null | undefined): boolean {
  return status === 'approved'
}

/**
 * Mask a tax ID for display: show only last 4 characters.
 * e.g. "12-3456789" → "***-***6789"
 */
export function maskTaxId(taxId: string | null | undefined): string | null {
  if (!taxId) return null
  const digits = taxId.replace(/\D/g, '')
  if (digits.length <= 4) return taxId // too short to mask meaningfully
  const last4 = digits.slice(-4)
  return `***-**${last4}`
}
