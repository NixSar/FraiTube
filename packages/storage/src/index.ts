import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { openRecordTable, type RecordTable } from './records'
import { migrate, type ModuleSchema } from './schema'

export { createRecordTableSql, type RecordTable, type StoredRecord } from './records'
export { isSafeName, syncedTables, type Migration, type ModuleSchema } from './schema'

export interface StorageOptions {
  /** Clock for change times, in milliseconds. Defaults to Date.now. */
  now?: () => number
}

export interface Storage {
  /** A random ID for this computer, created with the database and kept for its lifetime. */
  readonly computerId: string
  readonly db: DatabaseSync
  records<T>(table: string): RecordTable<T>
  close(): void
}

function readComputerId(db: DatabaseSync): string {
  db.exec('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
  db.prepare("INSERT INTO _meta (key, value) VALUES ('computer_id', ?) ON CONFLICT (key) DO NOTHING").run(randomUUID())
  const row = db.prepare("SELECT value FROM _meta WHERE key = 'computer_id'").get() as { value: string }
  return row.value
}

/** Opens this computer's database file, creating it when missing, and upgrades every module's tables. */
export function openStorage(file: string, schemas: ModuleSchema[], options: StorageOptions = {}): Storage {
  const now = options.now ?? Date.now
  const db = new DatabaseSync(file)

  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    const computerId = readComputerId(db)
    migrate(db, schemas)

    return {
      computerId,
      db,
      records: <T>(table: string) => openRecordTable<T>(db, table, now),
      close: () => db.close()
    }
  } catch (error) {
    db.close()
    throw error
  }
}
