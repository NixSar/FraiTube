import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { isSafeName } from './schema'

/** One stored record. A removed record keeps its key and change time as a removal marker. */
export interface StoredRecord<T> {
  key: string
  value: T | undefined
  changedAt: number
  removed: boolean
}

export interface RecordTable<T> {
  get(key: string): T | undefined
  put(key: string, value: T): void
  remove(key: string): void
  /** Every record that is not removed, in key order. */
  list(): { key: string; value: T }[]
  /** Every record, removal markers included, changed after the given time. */
  changesSince(time: number): StoredRecord<T>[]
}

/** The SQL that creates a record table. Use it as an upgrade step of the module that owns the table. */
export function createRecordTableSql(table: string): string {
  if (!isSafeName(table)) {
    throw new Error(`Invalid table name "${table}"`)
  }
  return `CREATE TABLE ${table} (
    key TEXT PRIMARY KEY,
    data TEXT,
    changed_at INTEGER NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  CREATE INDEX ${table}_changed_at ON ${table} (changed_at);`
}

interface Row {
  key: string
  data: string | null
  changed_at: number
  removed: number
}

export function openRecordTable<T>(db: DatabaseSync, table: string, now: () => number): RecordTable<T> {
  if (!isSafeName(table)) {
    throw new Error(`Invalid table name "${table}"`)
  }

  const select = db.prepare(`SELECT key, data, changed_at, removed FROM ${table} WHERE key = ?`)
  const write: StatementSync = db.prepare(
    `INSERT INTO ${table} (key, data, changed_at, removed) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET data = excluded.data, changed_at = excluded.changed_at, removed = excluded.removed`
  )
  const selectLive = db.prepare(`SELECT key, data FROM ${table} WHERE removed = 0 ORDER BY key`)
  const selectChanges = db.prepare(
    `SELECT key, data, changed_at, removed FROM ${table} WHERE changed_at > ? ORDER BY changed_at, key`
  )

  // A record's change time always moves forward, even when the clock does not.
  function nextTime(key: string): number {
    const row = select.get(key) as Row | undefined
    return Math.max(now(), (row?.changed_at ?? 0) + 1)
  }

  function parse(data: string | null): T | undefined {
    return data === null ? undefined : (JSON.parse(data) as T)
  }

  return {
    get(key) {
      const row = select.get(key) as Row | undefined
      return row && row.removed === 0 ? parse(row.data) : undefined
    },
    put(key, value) {
      write.run(key, JSON.stringify(value), nextTime(key), 0)
    },
    remove(key) {
      write.run(key, null, nextTime(key), 1)
    },
    list() {
      return (selectLive.all() as unknown as Pick<Row, 'key' | 'data'>[])
        .map((row) => ({ key: row.key, value: parse(row.data) as T }))
    },
    changesSince(time) {
      return (selectChanges.all(time) as unknown as Row[]).map((row) => ({
        key: row.key,
        value: parse(row.data),
        changedAt: row.changed_at,
        removed: row.removed === 1
      }))
    }
  }
}
