'use client'

import { CURRENCY_OPTIONS, CurrencyCode } from '@/lib/currencies'

interface CurrencySelectorProps {
  value: CurrencyCode
  onChange: (currency: CurrencyCode) => void
  className?: string
  disabled?: boolean
}

export function CurrencySelector({
  value,
  onChange,
  className = '',
  disabled = false
}: CurrencySelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      disabled={disabled}
      className={`px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {CURRENCY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.symbol} {option.value} - {option.name}
        </option>
      ))}
    </select>
  )
}
