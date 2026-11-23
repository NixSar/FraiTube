import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ModuleSchema } from '@fraitube/storage'
import { packArchive, unpackArchive } from './archive'
import type { BackupManifest, LoadSevenZip } from './types'

export const DATABASE_FILE = 'fraitube.db'
export const MANIFEST_FILE = 'manifest.json'

/** Loads the 7-Zip program from the installed 7z-wasm package, for use outside the bundled app. */
export const loadSevenZipFromPackage: LoadSevenZip = async () => {
  const file = createRequire(import.meta.url).resolve('7z-wasm/7zz.wasm')
  const data = await readFile(file)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** The suggested backup file name, in local time, for example FraiTube-backup-2026-11-22-1830.7z. */
export function backupFileName(date: Date): string {
  return `FraiTube-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.7z`
}

function moduleVersions(db: DatabaseSync): Record<string, number> {
  const rows = db.prepare('SELECT module, version FROM _schema ORDER BY module').all() as { module: string; version: number }[]
  return Object.fromEntries(rows.map((row) => [row.module, row.version]))
}

export interface CreateBackupOptions {
  db: DatabaseSync
  appVersion: string
  /** A folder for the database copy while the backup is made. */
  tempFolder: string
  loadSevenZip: LoadSevenZip
  now?: () => number
}

/** Makes a 7z archive of a consistent copy of the database and its manifest. */
export async function createBackup(options: CreateBackupOptions): Promise<Uint8Array> {
  const copy = join(options.tempFolder, `backup-${randomUUID()}.db`)
  try {
    // VACUUM INTO writes a consistent copy, even while the app keeps using the database.
    options.db.prepare('VACUUM INTO ?').run(copy)
    const manifest: BackupManifest = {
      format: 'fraitube-backup',
      version: 1,
      appVersion: options.appVersion,
      createdAt: (options.now ?? Date.now)(),
      modules: moduleVersions(options.db)
    }
    return await packArchive([
      { name: MANIFEST_FILE, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
      { name: DATABASE_FILE, data: new Uint8Array(await readFile(copy)) }
    ], options.loadSevenZip)
  } finally {
    await rm(copy, { force: true })
  }
}

function isManifest(value: unknown): value is BackupManifest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const manifest = value as Partial<BackupManifest>
  return manifest.format === 'fraitube-backup' &&
    manifest.version === 1 &&
    typeof manifest.appVersion === 'string' &&
    typeof manifest.createdAt === 'number' &&
    typeof manifest.modules === 'object' && manifest.modules !== null &&
    Object.values(manifest.modules).every((version) => Number.isSafeInteger(version) && version >= 0)
}

/** Throws when a module in the backup is at a newer table version than this app knows. */
export function checkManifest(manifest: BackupManifest, schemas: readonly ModuleSchema[]): void {
  for (const schema of schemas) {
    const version = manifest.modules[schema.module] ?? 0
    if (version > schema.migrations.length) {
      throw new Error(`This backup comes from a newer FraiTube version (${manifest.appVersion})`)
    }
  }
}

/** Reads a backup archive. Throws for a file that is not a FraiTube backup. */
export async function readBackup(archive: Uint8Array, loadSevenZip: LoadSevenZip): Promise<{ manifest: BackupManifest; database: Uint8Array }> {
  let files
  try {
    files = await unpackArchive(archive, [MANIFEST_FILE, DATABASE_FILE], loadSevenZip)
  } catch {
    throw new Error('This file is not a FraiTube backup')
  }
  const manifestFile = files.find((file) => file.name === MANIFEST_FILE)
  const database = files.find((file) => file.name === DATABASE_FILE)
  let manifest: unknown
  try {
    manifest = manifestFile ? JSON.parse(new TextDecoder().decode(manifestFile.data)) : undefined
  } catch {
    manifest = undefined
  }
  if (!isManifest(manifest) || !database) {
    throw new Error('This file is not a FraiTube backup')
  }
  return { manifest, database: database.data }
}

/** Removes a database file and the files SQLite keeps next to it. */
export async function removeDatabaseFiles(file: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(file + suffix, { force: true })
  }
}

/**
 * Puts the restored database in the place of the current one, which must be closed and is kept as
 * the previous file. When that fails, the current database is back in its place and the error is thrown.
 */
export async function replaceDatabase(current: string, restored: string, previous: string): Promise<void> {
  await removeDatabaseFiles(previous)
  await rename(current, previous)
  try {
    for (const suffix of ['-wal', '-shm']) {
      await rm(current + suffix, { force: true })
      await rm(restored + suffix, { force: true })
    }
    await rename(restored, current)
  } catch (error) {
    await rename(previous, current)
    throw error
  }
}

export interface AdoptOptions {
  /** This computer's ID, which the restored database keeps. */
  computerId: string
  /** The current database, whose tables in `keepTables` replace the restored ones. */
  currentDb: DatabaseSync
  /** Tables that belong to this computer, such as local settings. */
  keepTables: readonly string[]
  /** Tables emptied in the restored database, such as the sync state. */
  clearTables: readonly string[]
}

const SAFE_NAME = /^[a-z][a-z0-9_]*$/

function hasTable(db: DatabaseSync, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

/**
 * Writes a restored database to the file and makes it this computer's: it checks the file, keeps this
 * computer's ID and its own tables, and empties the listed tables.
 */
export async function writeRestoredDatabase(file: string, database: Uint8Array, options: AdoptOptions): Promise<void> {
  for (const table of [...options.keepTables, ...options.clearTables]) {
    if (!SAFE_NAME.test(table)) {
      throw new Error(`Invalid table name "${table}"`)
    }
  }
  await writeFile(file, database)
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(file)
    const check = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined
    if (check?.integrity_check !== 'ok' || !hasTable(db, '_schema') || !hasTable(db, '_meta')) {
      throw new Error('The database in this backup is damaged')
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare("INSERT INTO _meta (key, value) VALUES ('computer_id', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .run(options.computerId)
      for (const table of options.keepTables) {
        if (!hasTable(db, table) || !hasTable(options.currentDb, table)) {
          continue
        }
        db.exec(`DELETE FROM ${table}`)
        const rows = options.currentDb.prepare(`SELECT key, data, changed_at, removed FROM ${table}`).all() as {
          key: string
          data: string | null
          changed_at: number
          removed: number
        }[]
        const insert = db.prepare(`INSERT INTO ${table} (key, data, changed_at, removed) VALUES (?, ?, ?, ?)`)
        for (const row of rows) {
          insert.run(row.key, row.data, row.changed_at, row.removed)
        }
      }
      for (const table of options.clearTables) {
        if (hasTable(db, table)) {
          db.exec(`DELETE FROM ${table}`)
        }
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    db.close()
    db = undefined
  } catch (error) {
    db?.close()
    await rm(file, { force: true })
    throw error
  }
}
