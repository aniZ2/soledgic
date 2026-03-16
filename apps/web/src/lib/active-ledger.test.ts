import { describe, expect, it } from 'vitest'
import { pickActiveLedger } from './active-ledger'

describe('pickActiveLedger', () => {
  const ledgers = [
    { ledger_group_id: 'group-a', name: 'First' },
    { ledger_group_id: 'group-b', name: 'Second' },
    { ledger_group_id: 'group-c', name: 'Third' },
  ]

  it('returns the ledger matching the active group ID', () => {
    expect(pickActiveLedger(ledgers, 'group-b')).toBe(ledgers[1])
  })

  it('falls back to the first ledger when group ID does not match', () => {
    expect(pickActiveLedger(ledgers, 'nonexistent')).toBe(ledgers[0])
  })

  it('falls back to the first ledger when group ID is null', () => {
    expect(pickActiveLedger(ledgers, null)).toBe(ledgers[0])
  })

  it('returns undefined for null ledger list', () => {
    expect(pickActiveLedger(null, 'group-a')).toBeUndefined()
  })

  it('returns undefined for undefined ledger list', () => {
    expect(pickActiveLedger(undefined, 'group-a')).toBeUndefined()
  })

  it('returns undefined for empty ledger list', () => {
    expect(pickActiveLedger([], 'group-a')).toBeUndefined()
  })

  it('works with ledgers missing ledger_group_id', () => {
    const noGroup = [{ name: 'No group' }]
    expect(pickActiveLedger(noGroup, 'group-a')).toBe(noGroup[0])
  })
})
