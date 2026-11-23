import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeSyncFile, MAX_OWN_FILES, syncFileName } from '../../packages/sync/src/index'
import { cleanUp, computer, testFolder } from './helpers'

afterEach(cleanUp)

function ownFiles(root: string, computerId: string): string[] {
  return readdirSync(join(root, computerId)).sort()
}

describe('createSyncEngine', () => {
  it('sends own changes in a compressed file and merges them on the other computer', async () => {
    const folder = testFolder('send')
    const root = join(folder, 'root')
    const a = computer(folder)
    const b = computer(folder)
    a.storage.records('items').put('one', { name: 'One' })
    a.storage.records('items').put('two', { name: 'Two' })

    expect(await a.engine.run(root)).toMatchObject({ sent: 2, received: 0, computers: 0 })
    const [name] = ownFiles(root, a.storage.computerId)
    const file = decodeSyncFile(readFileSync(join(root, a.storage.computerId, name ?? '')))
    expect(file.computerId).toBe(a.storage.computerId)
    expect(file.changes.map((change) => change.key)).toEqual(['one', 'two'])

    const result = await b.engine.run(root)
    expect(result).toMatchObject({ sent: 0, received: 2, computers: 1, changedKeys: { items: ['one', 'two'] } })
    expect(b.storage.records('items').get('one')).toEqual({ name: 'One' })
  })

  it('lets the newer change win on every computer', async () => {
    const folder = testFolder('newest')
    const root = join(folder, 'root')
    const a = computer(folder, 100)
    const b = computer(folder, 200)
    a.storage.records('items').put('x', 'from a')
    b.storage.records('items').put('x', 'from b')

    await a.engine.run(root)
    await b.engine.run(root)
    await a.engine.run(root)
    expect(a.storage.records('items').get('x')).toBe('from b')
    expect(b.storage.records('items').get('x')).toBe('from b')
  })

  it('picks the computer with the higher ID when two changes have the same time', async () => {
    const folder = testFolder('tie')
    const root = join(folder, 'root')
    const a = computer(folder, 500)
    const b = computer(folder, 500)
    a.storage.records('items').put('x', a.storage.computerId)
    b.storage.records('items').put('x', b.storage.computerId)

    await a.engine.run(root)
    await b.engine.run(root)
    await a.engine.run(root)
    const winner = [a.storage.computerId, b.storage.computerId].sort()[1]
    expect(a.storage.records('items').get('x')).toBe(winner)
    expect(b.storage.records('items').get('x')).toBe(winner)
  })

  it('carries removal markers', async () => {
    const folder = testFolder('removal')
    const root = join(folder, 'root')
    const a = computer(folder, 100)
    const b = computer(folder, 100)
    a.storage.records('items').put('x', 'kept for now')
    await a.engine.run(root)
    await b.engine.run(root)

    a.setTime(300)
    a.storage.records('items').remove('x')
    await a.engine.run(root)
    expect(await b.engine.run(root)).toMatchObject({ received: 1 })
    expect(b.storage.records('items').get('x')).toBeUndefined()
    expect(b.storage.records('items').changesSince(0)).toMatchObject([{ key: 'x', removed: true, changedAt: 300 }])
  })

  it('never writes changes from other computers into its own files', async () => {
    const folder = testFolder('own-only')
    const root = join(folder, 'root')
    const a = computer(folder)
    const b = computer(folder)
    a.storage.records('items').put('x', 'from a')
    await a.engine.run(root)
    await b.engine.run(root)
    expect(await b.engine.run(root)).toMatchObject({ sent: 0 })
    expect(readdirSync(root)).toContain(b.storage.computerId)
    expect(ownFiles(root, b.storage.computerId)).toEqual([])
  })

  it('never sends tables that are not synced, and ignores them in files', async () => {
    const folder = testFolder('local')
    const root = join(folder, 'root')
    const a = computer(folder)
    const b = computer(folder)
    a.storage.records('local_items').put('volume', 50)
    expect(await a.engine.run(root)).toMatchObject({ sent: 0 })

    const other = '00000000-0000-4000-8000-000000000001'
    mkdirSync(join(root, other), { recursive: true })
    const { encodeSyncFile } = await import('../../packages/sync/src/format')
    writeFileSync(join(root, other, syncFileName(2000, 0)), encodeSyncFile({
      format: 'fraitube-sync',
      version: 1,
      computerId: other,
      createdAt: 2000,
      changes: [{ table: 'local_items', key: 'volume', data: '400', changedAt: 2000, removed: false }]
    }))
    expect(await b.engine.run(root)).toMatchObject({ received: 0, computers: 2 })
    expect(b.storage.records('local_items').get('volume')).toBeUndefined()
  })

  it('replaces many own files with one file holding every own record', async () => {
    const folder = testFolder('merge-files')
    const root = join(folder, 'root')
    const a = computer(folder, 100)
    for (let i = 0; i <= MAX_OWN_FILES; i++) {
      a.setTime(100 + i)
      a.storage.records('items').put(`item${i}`, i)
      await a.engine.run(root)
    }
    expect(ownFiles(root, a.storage.computerId)).toHaveLength(1)

    const b = computer(folder)
    expect(await b.engine.run(root)).toMatchObject({ received: MAX_OWN_FILES + 1 })
    expect(b.storage.records('items').list()).toHaveLength(MAX_OWN_FILES + 1)
  })

  it('reads a damaged file again on the next run', async () => {
    const folder = testFolder('damaged')
    const root = join(folder, 'root')
    const a = computer(folder)
    const b = computer(folder)
    a.storage.records('items').put('x', 'value')
    await a.engine.run(root)
    const [name] = ownFiles(root, a.storage.computerId)
    const path = join(root, a.storage.computerId, name ?? '')
    const good = readFileSync(path)
    writeFileSync(path, 'not a sync file')

    expect(await b.engine.run(root)).toMatchObject({ received: 0, unreadable: 1 })
    writeFileSync(path, good)
    expect(await b.engine.run(root)).toMatchObject({ received: 1, unreadable: 0 })
  })
})
