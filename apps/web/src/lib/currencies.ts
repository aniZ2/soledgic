// Supported currencies with display info
export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  CHF: { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', decimals: 2 },
  MXN: { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
} as const

export type CurrencyCode = keyof typeof CURRENCIES

export function getCurrencyInfo(code: CurrencyCode | string) {
  return CURRENCIES[code as CurrencyCode] || CURRENCIES.USD
}

export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode | string = 'USD',
  options: { showCode?: boolean; asMinorUnits?: boolean } = {}
) {
  const currency = getCurrencyInfo(currencyCode)
  const { showCode = false, asMinorUnits = true } = options

  // If amount is in cents/minor units, convert to major units
  const value = asMinorUnits
    ? amount / Math.pow(10, currency.decimals)
    : amount

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value)

  return showCode ? `${formatted} ${currency.code}` : formatted
}

export function toMinorUnits(amount: number, currencyCode: CurrencyCode | string = 'USD') {
  const currency = getCurrencyInfo(currencyCode)
  return Math.round(amount * Math.pow(10, currency.decimals))
}

export function fromMinorUnits(amount: number, currencyCode: CurrencyCode | string = 'USD') {
  const currency = getCurrencyInfo(currencyCode)
  return amount / Math.pow(10, currency.decimals)
}

// Currency selector options
export const CURRENCY_OPTIONS = Object.values(CURRENCIES).map(c => ({
  value: c.code,
  label: `${c.symbol} ${c.code} - ${c.name}`,
  symbol: c.symbol,
  name: c.name,
}))
