import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StatementSync } from 'node:sqlite'
import { isSafeName, type ModuleSchema, type Storage } from '@fraitube/storage'
import { decodeSyncFile, encodeSyncFile, isComputerId, isSyncFileName, syncFileName } from './format'
import { isNewer, type RecordVersion } from './merge'
import type { SyncChange, SyncResult } from './types'

/** Own files kept before they are replaced by one file holding all own records. */
export const MAX_OWN_FILES = 20

/**
 * The sync module's own tables. sync_versions holds, per record, the version last seen in any computer's
 * sync files and which computer made it; a record whose change time differs is an own change not sent yet.
 * sync_read_files lists the files of other computers already read.
 */
export const syncSchema: ModuleSchema = {
  module: 'sync',
  migrations: [{
    version: 1,
    up: `CREATE TABLE sync_versions (
      tbl TEXT NOT NULL,
      key TEXT NOT NULL,
      changed_at INTEGER NOT NULL,
      computer_id TEXT NOT NULL,
      PRIMARY KEY (tbl, key)
    ) STRICT;
    CREATE TABLE sync_read_files (
      computer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (computer_id, name)
    ) STRICT;`
  }]
}

export interface SyncEngineOptions {
  storage: Storage
  /** The record tables that sync. Changes for any other table are ignored. */
  tables: readonly string[]
  now?: () => number
}

export interface SyncEngine {
  /** Sends own changes into the root folder and merges every other computer's files from it. */
  run(root: string): Promise<SyncResult>
}

interface Row {
  key: string
  data: string | null
  changed_at: number
  removed: number
}

interface TableStatements {
  unsent: StatementSync
  own: StatementSync
  select: StatementSync
  write: StatementSync
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { storage } = options
  const db = storage.db
  const own = storage.computerId
  const now = options.now ?? Date.now
  const tables = new Set(options.tables)
  for (const table of tables) {
    if (!isSafeName(table)) {
      throw new Error(`Invalid table name "${table}"`)
    }
  }

  const readVersion = db.prepare('SELECT changed_at, computer_id FROM sync_versions WHERE tbl = ? AND key = ?')
  const writeVersion = db.prepare(
    `INSERT INTO sync_versions (tbl, key, changed_at, computer_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (tbl, key) DO UPDATE SET changed_at = excluded.changed_at, computer_id = excluded.computer_id`
  )
  const readFiles = db.prepare('SELECT name FROM sync_read_files WHERE computer_id = ?')
  const markRead = db.prepare('INSERT INTO sync_read_files (computer_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING')
  const forgetRead = db.prepare('DELETE FROM sync_read_files WHERE computer_id = ? AND name = ?')

  const statements = new Map<string, TableStatements>()
  for (const table of tables) {
    statements.set(table, {
      unsent: db.prepare(
        `SELECT r.key, r.data, r.changed_at, r.removed FROM ${table} r
         LEFT JOIN sync_versions v ON v.tbl = ? AND v.key = r.key
         WHERE v.changed_at IS NULL OR v.changed_at != r.changed_at
         ORDER BY r.changed_at, r.key`
      ),
      own: db.prepare(
        `SELECT r.key, r.data, r.changed_at, r.removed FROM ${table} r
         JOIN sync_versions v ON v.tbl = ? AND v.key = r.key AND v.changed_at = r.changed_at AND v.computer_id = ?
         ORDER BY r.changed_at, r.key`
      ),
      select: db.prepare(`SELECT key, data, changed_at, removed FROM ${table} WHERE key = ?`),
      write: db.prepare(
        `INSERT INTO ${table} (key, data, changed_at, removed) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET data = excluded.data, changed_at = excluded.changed_at, removed = excluded.removed`
      )
    })
  }

  function transaction(work: () => void): void {
    db.exec('BEGIN IMMEDIATE')
    try {
      work()
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function toChange(table: string, row: Row): SyncChange {
    return { table, key: row.key, data: row.removed === 1 ? null : row.data, changedAt: row.changed_at, removed: row.removed === 1 }
  }

  function collect(kind: 'unsent' | 'own'): SyncChange[] {
    const changes: SyncChange[] = []
    for (const [table, statement] of statements) {
      const rows = (kind === 'unsent' ? statement.unsent.all(table) : statement.own.all(table, own)) as unknown as Row[]
      changes.push(...rows.map((row) => toChange(table, row)))
    }
    return changes
  }

  /** Writes a file under a temporary name and then renames it, so no computer ever reads half a file. */
  async function writeOwnFile(folder: string, changes: SyncChange[]): Promise<string> {
    const createdAt = now()
    const existing = new Set(await readdir(folder))
    let sequence = 0
    while (existing.has(syncFileName(createdAt, sequence))) {
      sequence++
    }
    const name = syncFileName(createdAt, sequence)
    const temporary = join(folder, `${name}.tmp`)
    await writeFile(temporary, encodeSyncFile({ format: 'fraitube-sync', version: 1, computerId: own, createdAt, changes }))
    await rename(temporary, join(folder, name))
    return name
  }

  async function send(folder: string): Promise<number> {
    const changes = collect('unsent')
    if (changes.length > 0) {
      await writeOwnFile(folder, changes)
      transaction(() => {
        for (const change of changes) {
          writeVersion.run(change.table, change.key, change.changedAt, own)
        }
      })
    }

    // Many small files are replaced by one file of all own records.
    const files = (await readdir(folder)).filter(isSyncFileName)
    if (files.length > MAX_OWN_FILES) {
      const snapshot = await writeOwnFile(folder, collect('own'))
      for (const name of files) {
        if (name !== snapshot) {
          await rm(join(folder, name), { force: true })
        }
      }
    }
    return changes.length
  }

  function currentVersion(table: string, row: Row | undefined): RecordVersion | undefined {
    if (!row) {
      return undefined
    }
    const seen = readVersion.get(table, row.key) as { changed_at: number; computer_id: string } | undefined
    return { changedAt: row.changed_at, computerId: seen && seen.changed_at === row.changed_at ? seen.computer_id : own }
  }

  function apply(computerId: string, changes: readonly SyncChange[], result: SyncResult): void {
    for (const change of changes) {
      const statement = statements.get(change.table)
      if (!statement) {
        continue
      }
      const row = statement.select.get(change.key) as Row | undefined
      if (!isNewer({ changedAt: change.changedAt, computerId }, currentVersion(change.table, row))) {
        continue
      }
      statement.write.run(change.key, change.removed ? null : change.data, change.changedAt, change.removed ? 1 : 0)
      writeVersion.run(change.table, change.key, change.changedAt, computerId)
      result.received++
      ;(result.changedKeys[change.table] ??= []).push(change.key)
    }
  }

  async function receive(root: string, result: SyncResult): Promise<number> {
    let unreadable = 0
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !isComputerId(entry.name) || entry.name === own) {
        continue
      }
      result.computers++
      const computerId = entry.name
      const folder = join(root, computerId)
      const names = (await readdir(folder)).filter(isSyncFileName).sort()
      const read = new Set((readFiles.all(computerId) as { name: string }[]).map((row) => row.name))
      for (const name of names) {
        if (read.has(name)) {
          continue
        }
        let changes: SyncChange[]
        try {
          const file = decodeSyncFile(await readFile(join(folder, name)))
          if (file.computerId !== computerId) {
            throw new Error('The file belongs to another computer')
          }
          changes = file.changes
        } catch {
          // A file still arriving or damaged is read again on the next run.
          unreadable++
          continue
        }
        transaction(() => {
          apply(computerId, changes, result)
          markRead.run(computerId, name)
        })
      }
      // Files the other computer replaced no longer need to be remembered.
      const present = new Set(names)
      for (const name of read) {
        if (!present.has(name)) {
          forgetRead.run(computerId, name)
        }
      }
    }
    return unreadable
  }

  return {
    async run(root) {
      const folder = join(root, own)
      await mkdir(folder, { recursive: true })
      const result: SyncResult = { sent: 0, received: 0, computers: 0, unreadable: 0, changedKeys: {} }
      result.sent = await send(folder)
      result.unreadable = await receive(root, result)
      return result
    }
  }
}
