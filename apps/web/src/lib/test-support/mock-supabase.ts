type JsonRecord = Record<string, any>
type MockDb = Record<string, JsonRecord[]>

function clone<T>(value: T): T {
  return structuredClone(value)
}

function withDefaults(row: JsonRecord): JsonRecord {
  const nextRow = clone(row)
  if (!nextRow.id) {
    nextRow.id = crypto.randomUUID()
  }
  return nextRow
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date) {
    return actual.toISOString() === expected
  }
  return actual === expected
}

class MockQueryBuilder {
  private readonly db: MockDb
  private readonly table: string
  private filters: Array<(row: JsonRecord) => boolean> = []
  private operation: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private payload: JsonRecord[] | JsonRecord | null = null
  private conflictKeys: string[] = []
  private orderBy: { field: string; ascending: boolean } | null = null

  constructor(db: MockDb, table: string) {
    this.db = db
    this.table = table
  }

  select(_columns?: string) {
    return this
  }

  insert(payload: JsonRecord | JsonRecord[]) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: JsonRecord) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: JsonRecord | JsonRecord[], options?: { onConflict?: string }) {
    this.operation = 'upsert'
    this.payload = payload
    this.conflictKeys = (options?.onConflict || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => matchesValue(row[field], value))
    return this
  }

  neq(field: string, value: unknown) {
    this.filters.push((row) => !matchesValue(row[field], value))
    return this
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.some((value) => matchesValue(row[field], value)))
    return this
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = {
      field,
      ascending: options?.ascending !== false,
    }
    return this
  }

  async maybeSingle() {
    const result = await this.executeRows()
    return { data: result[0] ?? null, error: null }
  }

  async single() {
    const result = await this.executeRows()
    return {
      data: result[0] ?? null,
      error: result.length > 0 ? null : { code: 'PGRST116', message: 'No rows found' },
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: JsonRecord[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private get tableRows() {
    if (!this.db[this.table]) {
      this.db[this.table] = []
    }
    return this.db[this.table]
  }

  private filteredRows(): JsonRecord[] {
    let rows = this.tableRows.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.orderBy) {
      const { field, ascending } = this.orderBy
      rows = [...rows].sort((left, right) => {
        const leftValue = left[field]
        const rightValue = right[field]
        if (leftValue === rightValue) return 0
        if (leftValue == null) return ascending ? -1 : 1
        if (rightValue == null) return ascending ? 1 : -1
        return ascending
          ? String(leftValue).localeCompare(String(rightValue))
          : String(rightValue).localeCompare(String(leftValue))
      })
    }
    return rows
  }

  private async executeRows(): Promise<JsonRecord[]> {
    switch (this.operation) {
      case 'select':
        return clone(this.filteredRows())
      case 'insert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload || {}]
        const inserted = rows.map((row) => withDefaults(row))
        this.tableRows.push(...inserted)
        return clone(inserted)
      }
      case 'update': {
        const rows = this.filteredRows()
        for (const row of rows) {
          Object.assign(row, clone(this.payload || {}))
        }
        return clone(rows)
      }
      case 'upsert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload || {}]
        const upserted: JsonRecord[] = []

        for (const incomingRow of rows) {
          const match = this.tableRows.find((existingRow) =>
            this.conflictKeys.every((key) => matchesValue(existingRow[key], incomingRow[key])),
          )

          if (match) {
            Object.assign(match, clone(incomingRow))
            upserted.push(clone(match))
          } else {
            const inserted = withDefaults(incomingRow)
            this.tableRows.push(inserted)
            upserted.push(clone(inserted))
          }
        }

        return upserted
      }
    }
  }

  private async execute() {
    return { data: await this.executeRows(), error: null }
  }
}

export function createMockSupabase(db: MockDb) {
  return {
    from(table: string) {
      return new MockQueryBuilder(db, table)
    },
  }
}
