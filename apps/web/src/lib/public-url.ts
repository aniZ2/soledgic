const PROD_DEFAULT_APP_URL = 'https://app.soledgic.com'
const DEV_DEFAULT_APP_URL = 'http://localhost:3000'

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getPublicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return stripTrailingSlash(configured)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return stripTrailingSlash(window.location.origin)
  }

  return process.env.NODE_ENV === 'production' ? PROD_DEFAULT_APP_URL : DEV_DEFAULT_APP_URL
}

export function toAppUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getPublicAppUrl()}${normalizedPath}`
}
