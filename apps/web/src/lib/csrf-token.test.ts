import { describe, expect, it } from 'vitest'
import { generateCsrfToken } from './csrf-token'

describe('generateCsrfToken', () => {
  it('returns a 64-character hex string (32 bytes)', () => {
    const token = generateCsrfToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns lowercase hex only', () => {
    const token = generateCsrfToken()
    expect(token).toBe(token.toLowerCase())
  })

  it('generates unique tokens on successive calls', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateCsrfToken()))
    expect(tokens.size).toBe(20)
  })
})
