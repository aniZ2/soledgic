const PROD_DEFAULT_APP_URL = 'https://soledgic.com'
const DEV_DEFAULT_APP_URL = 'http://localhost:3000'

function stripTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getPublicAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return stripTrailingSlash(window.location.origin)
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return stripTrailingSlash(configured)
  }

  return process.env.NODE_ENV === 'production' ? PROD_DEFAULT_APP_URL : DEV_DEFAULT_APP_URL
}

export function toAppUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getPublicAppUrl()}${normalizedPath}`
}
