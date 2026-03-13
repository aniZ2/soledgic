export type BillingPricingMode = 'self_serve' | 'custom' | 'internal'

type JsonRecord = Record<string, unknown>

export interface BillingSettings {
  pricing_mode?: BillingPricingMode | null
  billing_bypass?: boolean | null
  bypass_reason?: string | null
  bypass_enabled_at?: string | null
  bypass_enabled_by?: string | null
  payment_method_id?: string | null
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseBillingSettings(value: unknown): BillingSettings {
  if (!isJsonRecord(value)) return {}

  const pricingMode =
    value.pricing_mode === 'internal' || value.pricing_mode === 'custom' || value.pricing_mode === 'self_serve'
      ? value.pricing_mode
      : null

  return {
    pricing_mode: pricingMode,
    billing_bypass: value.billing_bypass === true,
    bypass_reason: typeof value.bypass_reason === 'string' ? value.bypass_reason : null,
    bypass_enabled_at: typeof value.bypass_enabled_at === 'string' ? value.bypass_enabled_at : null,
    bypass_enabled_by: typeof value.bypass_enabled_by === 'string' ? value.bypass_enabled_by : null,
    payment_method_id: typeof value.payment_method_id === 'string' ? value.payment_method_id : null,
  }
}

export function resolveBillingMode(settings: BillingSettings | null | undefined): BillingPricingMode {
  if (settings?.pricing_mode === 'internal' || settings?.billing_bypass === true) {
    return 'internal'
  }
  if (settings?.pricing_mode === 'custom') {
    return 'custom'
  }
  return 'self_serve'
}

export function isBillingBypassed(settings: BillingSettings | null | undefined): boolean {
  return resolveBillingMode(settings) === 'internal'
}

export function isAutoChargeEnabled(settings: BillingSettings | null | undefined): boolean {
  return resolveBillingMode(settings) === 'self_serve'
}
