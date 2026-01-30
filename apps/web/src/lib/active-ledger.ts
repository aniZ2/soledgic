/**
 * Pick the preferred ledger from a list based on the active ledger group cookie.
 * Falls back to the first ledger if no group is selected or if the group
 * doesn't match any ledger in the list.
 *
 * Works with any object that has `ledger_group_id: string`.
 */
export function pickActiveLedger<T extends { ledger_group_id?: string }>(
  ledgers: T[] | null | undefined,
  activeLedgerGroupId: string | null
): T | undefined {
  if (!ledgers || ledgers.length === 0) return undefined

  if (activeLedgerGroupId) {
    const match = ledgers.find(l => l.ledger_group_id === activeLedgerGroupId)
    if (match) return match
  }

  return ledgers[0]
}
