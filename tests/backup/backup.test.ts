import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupFileName,
  checkManifest,
  createBackup,
  packArchive,
  readBackup,
  replaceDatabase,
  writeRestoredDatabase
} from '../../packages/backup/src/index'
import { createRecordTableSql, openStorage, type ModuleSchema, type Storage } from '../../packages/storage/src/index'
import { syncSchema } from '../../packages/sync/src/index'
import { TEST_DATA_DIR } from '../paths'

const appSchema: ModuleSchema = {
  module: 'app',
  migrations: [{ version: 1, up: createRecordTableSql('items') + createRecordTableSql('local_settings') }],
  synced: ['items']
}
const schemas = [appSchema, syncSchema]

const opened: Storage[] = []
const folders: string[] = []

function folder(): string {
  const path = join(TEST_DATA_DIR, 'backup', randomUUID())
  mkdirSync(path, { recursive: true })
  folders.push(path)
  return path
}

function open(path: string): Storage {
  const storage = openStorage(path, schemas)
  opened.push(storage)
  return storage
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const path of folders.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('backupFileName', () => {
  it('names the backup after the local date and time', () => {
    expect(backupFileName(new Date(2026, 10, 22, 18, 5))).toBe('FraiTube-backup-2026-11-22-1805.zip')
  })
})

describe('backup and restore', () => {
  it('packs the database with its manifest into a zip archive and reads it back', async () => {
    const dir = folder()
    const storage = open(join(dir, 'source.db'))
    storage.records('items').put('UChIs72whgZI9w6d6FhwGGHA', { name: 'Gamers Nexus' })

    const archive = await createBackup({ db: storage.db, appVersion: '0.0.0', tempFolder: dir, now: () => 1234 })
    expect(Buffer.from(archive.subarray(0, 4)).toString('hex')).toBe('504b0304')
    writeFileSync(join(dir, backupFileName(new Date(1234))), archive)

    const { manifest, database } = readBackup(new Uint8Array(readFileSync(join(dir, backupFileName(new Date(1234))))))
    expect(manifest).toEqual({ format: 'fraitube-backup', version: 1, appVersion: '0.0.0', createdAt: 1234, modules: { app: 1, sync: 1 } })

    writeFileSync(join(dir, 'copy.db'), database)
    const copy = new DatabaseSync(join(dir, 'copy.db'))
    expect(copy.prepare('SELECT data FROM items').get()).toEqual({ data: '{"name":"Gamers Nexus"}' })
    copy.close()
  })

  it('makes the restored database this computer\'s, keeping its ID and local settings and clearing the sync state', async () => {
    const dir = folder()
    const other = open(join(dir, 'other.db'))
    other.records('items').put('x', 'from the backup')
    other.records('local_settings').put('player.volume', 25)
    other.db.prepare("INSERT INTO sync_versions VALUES ('items', 'x', 1, ?)").run(other.computerId)
    other.db.prepare("INSERT INTO sync_read_files VALUES ('00000000-0000-4000-8000-000000000001', 'a')").run()
    const archive = await createBackup({ db: other.db, appVersion: '0.0.0', tempFolder: dir })

    const current = open(join(dir, 'current.db'))
    current.records('local_settings').put('player.volume', 200)
    const { database } = readBackup(archive)
    const restoredFile = join(dir, 'restored.db')
    await writeRestoredDatabase(restoredFile, database, {
      computerId: current.computerId,
      currentDb: current.db,
      keepTables: ['local_settings'],
      clearTables: ['sync_versions', 'sync_read_files']
    })

    const restored = open(restoredFile)
    expect(restored.computerId).toBe(current.computerId)
    expect(restored.computerId).not.toBe(other.computerId)
    expect(restored.records('items').get('x')).toBe('from the backup')
    expect(restored.records('local_settings').get('player.volume')).toBe(200)
    expect(restored.db.prepare('SELECT COUNT(*) AS n FROM sync_versions').get()).toEqual({ n: 0 })
    expect(restored.db.prepare('SELECT COUNT(*) AS n FROM sync_read_files').get()).toEqual({ n: 0 })
  })

  it('refuses a backup from a newer version', () => {
    const manifest = { format: 'fraitube-backup' as const, version: 1 as const, appVersion: '9.0.0', createdAt: 1, modules: { app: 2 } }
    expect(() => checkManifest(manifest, schemas)).toThrow('newer FraiTube version (9.0.0)')
    expect(() => checkManifest({ ...manifest, modules: { app: 1, unknown: 7 } }, schemas)).not.toThrow()
  })

  it('refuses files that are not FraiTube backups', () => {
    expect(() => readBackup(new TextEncoder().encode('not an archive'))).toThrow('not a FraiTube backup')
    const other = packArchive([{ name: 'notes.txt', data: new TextEncoder().encode('hello') }])
    expect(() => readBackup(other)).toThrow('not a FraiTube backup')
  })

  it('answers a 7z backup of an older version with the version that restores it', () => {
    const sevenZip = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4, 0, 0])
    expect(() => readBackup(sevenZip)).toThrow('Restore it with version 0.9.10')
  })

  it('puts the restored database in place and keeps the one it replaces', async () => {
    const dir = folder()
    const current = join(dir, 'fraitube.db')
    const restored = join(dir, 'fraitube.db.restore')
    const previous = join(dir, 'fraitube.db.before-restore')
    writeFileSync(current, 'current data')
    writeFileSync(restored, 'restored data')
    writeFileSync(previous, 'an older restore')
    writeFileSync(`${current}-wal`, 'left over')

    await replaceDatabase(current, restored, previous)

    expect(readFileSync(current, 'utf8')).toBe('restored data')
    expect(readFileSync(previous, 'utf8')).toBe('current data')
    expect(existsSync(restored)).toBe(false)
    expect(existsSync(`${current}-wal`)).toBe(false)
  })

  it('puts the current database back when the restored one cannot take its place', async () => {
    const dir = folder()
    const current = join(dir, 'fraitube.db')
    const previous = join(dir, 'fraitube.db.before-restore')
    writeFileSync(current, 'current data')

    await expect(replaceDatabase(current, join(dir, 'missing.restore'), previous)).rejects.toThrow()

    expect(readFileSync(current, 'utf8')).toBe('current data')
    expect(existsSync(previous)).toBe(false)
  })

  it('refuses a damaged database and leaves no file behind', async () => {
    const dir = folder()
    const current = open(join(dir, 'current.db'))
    const file = join(dir, 'restored.db')
    await expect(writeRestoredDatabase(file, new TextEncoder().encode('garbage'), {
      computerId: current.computerId,
      currentDb: current.db,
      keepTables: [],
      clearTables: []
    })).rejects.toThrow()
    expect(() => readFileSync(file)).toThrow()
  })
})
