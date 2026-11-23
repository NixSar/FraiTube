import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecordTableSql, openStorage, type ModuleSchema, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'storage')
const opened: Storage[] = []
const files: string[] = []

function newFile(): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  return file
}

function open(file: string, schemas: ModuleSchema[], now?: () => number): Storage {
  const storage = openStorage(file, schemas, { now })
  opened.push(storage)
  return storage
}

function versions(storage: Storage): Record<string, number> {
  const rows = storage.db.prepare('SELECT module, version FROM _schema').all() as { module: string; version: number }[]
  return Object.fromEntries(rows.map((row) => [row.module, row.version]))
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    try {
      storage.close()
    } catch {
      // Already closed by the test.
    }
  }
  for (const file of files.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(file + suffix, { force: true })
    }
  }
})

const notes: ModuleSchema = { module: 'notes', migrations: [{ version: 1, up: createRecordTableSql('notes') }] }

describe('openStorage', () => {
  it('runs every step on a new database and records the versions', () => {
    const storage = open(newFile(), [notes])
    expect(versions(storage)).toEqual({ notes: 1 })
  })

  it('runs only the new steps on an existing database', () => {
    const file = newFile()
    open(file, [notes]).close()

    let ran = 0
    const upgraded: ModuleSchema = {
      module: 'notes',
      migrations: [
        { version: 1, up: () => { throw new Error('step 1 must not run again') } },
        { version: 2, up: (db) => { ran++; db.exec('CREATE TABLE notes_extra (id TEXT) STRICT') } }
      ]
    }
    const storage = open(file, [upgraded])
    expect(ran).toBe(1)
    expect(versions(storage)).toEqual({ notes: 2 })
  })

  it('changes nothing when a step fails', () => {
    const file = newFile()
    const broken: ModuleSchema = {
      module: 'broken',
      migrations: [{ version: 1, up: 'CREATE TABLE kept (id TEXT) STRICT' }, { version: 2, up: 'NOT SQL' }]
    }
    expect(() => open(file, [notes, broken])).toThrow()

    const storage = open(file, [])
    const tables = storage.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    expect(tables.map((table) => table.name)).not.toContain('kept')
    expect(tables.map((table) => table.name)).not.toContain('notes')
    expect(versions(storage)).toEqual({})
  })

  it('refuses a database newer than the app', () => {
    const file = newFile()
    open(file, [{ module: 'notes', migrations: [notes.migrations[0]!, { version: 2, up: 'SELECT 1' }] }]).close()
    expect(() => open(file, [notes])).toThrow('newer than this app knows')
  })

  it('refuses badly numbered steps and unsafe names', () => {
    expect(() => open(newFile(), [{ module: 'gap', migrations: [{ version: 2, up: 'SELECT 1' }] }])).toThrow('in order')
    expect(() => open(newFile(), [{ module: 'Bad-Name', migrations: [] }])).toThrow('Invalid module name')
    expect(() => open(newFile(), [notes, notes])).toThrow('Duplicate schema')
    expect(() => createRecordTableSql('x; DROP TABLE y')).toThrow('Invalid table name')
  })

  it('keeps the same computer ID across openings', () => {
    const file = newFile()
    const first = open(file, [])
    const id = first.computerId
    first.close()
    expect(open(file, []).computerId).toBe(id)
    expect(open(newFile(), []).computerId).not.toBe(id)
  })
})

describe('record tables', () => {
  it('adds, updates, lists and removes records', () => {
    const storage = open(newFile(), [notes])
    const table = storage.records<{ text: string }>('notes')

    table.put('b', { text: 'two' })
    table.put('a', { text: 'one' })
    table.put('b', { text: 'two again' })
    expect(table.get('b')).toEqual({ text: 'two again' })
    expect(table.list()).toEqual([{ key: 'a', value: { text: 'one' } }, { key: 'b', value: { text: 'two again' } }])

    table.remove('a')
    expect(table.get('a')).toBeUndefined()
    expect(table.list().map((record) => record.key)).toEqual(['b'])
  })

  it('keeps removal markers and change times for sync', () => {
    let clock = 1000
    const storage = open(newFile(), [notes], () => clock)
    const table = storage.records<string>('notes')

    table.put('a', 'first')
    clock = 2000
    table.put('b', 'second')
    table.remove('a')

    expect(table.changesSince(1000)).toEqual([
      { key: 'a', value: undefined, changedAt: 2000, removed: true },
      { key: 'b', value: 'second', changedAt: 2000, removed: false }
    ])
  })

  it('moves a change time forward even when the clock goes back', () => {
    let clock = 5000
    const storage = open(newFile(), [notes], () => clock)
    const table = storage.records<string>('notes')

    table.put('a', 'one')
    clock = 1000
    table.put('a', 'two')
    expect(table.changesSince(0)[0]?.changedAt).toBe(5001)
  })
})
