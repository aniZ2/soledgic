import { jsonResponse } from './utils.ts'

export type JsonObject = Record<string, unknown>
export type ResourceResult<T extends JsonObject = JsonObject> = {
  status: number
  body: T
}

export function resourceOk<T extends JsonObject>(body: T, status = 200): ResourceResult<T> {
  return { status, body }
}

export function resourceError(
  error: string,
  status: number,
  extra: JsonObject = {},
  errorCode?: string,
): ResourceResult<JsonObject> {
  return {
    status,
    body: {
      success: false,
      error,
      ...(errorCode ? { error_code: errorCode } : {}),
      ...extra,
    },
  }
}

export function respondWithResult(
  req: Request,
  requestId: string,
  result: ResourceResult,
): Response {
  return jsonResponse(result.body, result.status, req, requestId)
}

export function getResourceSegments(req: Request, resourceName: string): string[] {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const resourceIndex = pathParts.findIndex((part) => part === resourceName)
  return resourceIndex >= 0 ? pathParts.slice(resourceIndex + 1) : []
}

export function asJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as JsonObject
}

export function getBooleanParam(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name)
  if (raw === null) return undefined
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

export function getNumberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name)
  if (!raw) return undefined

  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}
