// Soledgic: Input validation functions
// Extracted from utils.ts to reduce blast radius.
// All validators return the cleaned value or null on failure.

export function isProduction(): boolean {
  return (Deno.env.get('ENVIRONMENT') || Deno.env.get('NODE_ENV') || 'production') === 'production'
}

export function validateAmount(amount: any): number | null {
  if (typeof amount !== 'number') return null
  if (!Number.isFinite(amount)) return null
  if (amount < 0) return null
  if (amount > 100000000) return null // $1M max (in cents)
  return Math.round(amount) // Ensure integer cents
}

export function validateId(id: any, maxLength = 100): string | null {
  if (typeof id !== 'string') return null
  if (id.length === 0 || id.length > maxLength) return null
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null
  return id
}

export function validateUUID(id: any): string | null {
  if (typeof id !== 'string') return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null
  }
  return id.toLowerCase()
}

export function validateEmail(email: any): string | null {
  if (typeof email !== 'string') return null
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return null
  if (email.length > 254) return null
  return email.toLowerCase()
}

export function validateString(str: any, maxLength = 1000): string | null {
  if (typeof str !== 'string') return null
  if (str.length > maxLength) return null
  const sanitized = str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
  return sanitized.trim()
}

export function validateUrl(url: any): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    if (isProduction() && parsed.protocol !== 'https:') return null
    if (parsed.protocol === 'javascript:') return null
    return url
  } catch {
    return null
  }
}

export function validateDate(dateStr: any): string | null {
  if (typeof dateStr !== 'string') return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  if (date.getFullYear() < 1970 || date.getFullYear() > 2100) return null
  return date.toISOString()
}

export function validateInteger(value: any, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}
