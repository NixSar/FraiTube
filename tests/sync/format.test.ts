import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeSyncFile, encodeSyncFile, isComputerId, isSyncFileName, syncFileName } from '../../packages/sync/src/format'
import { isNewer } from '../../packages/sync/src/merge'
import type { SyncFile } from '../../packages/sync/src/types'

const file: SyncFile = {
  format: 'fraitube-sync',
  version: 1,
  computerId: '00000000-0000-4000-8000-000000000001',
  createdAt: 1000,
  changes: [
    { table: 'subscriptions', key: 'UChIs72whgZI9w6d6FhwGGHA', data: '{"name":"Gamers Nexus"}', changedAt: 1000, removed: false },
    { table: 'history', key: 'l8qxFcaLSM4', data: null, changedAt: 999, removed: true }
  ]
}

describe('sync file format', () => {
  it('is gzip-compressed JSON that reads back the same', () => {
    const encoded = encodeSyncFile(file)
    expect(encoded[0]).toBe(0x1f)
    expect(encoded[1]).toBe(0x8b)
    expect(decodeSyncFile(encoded)).toEqual(file)
  })

  it('refuses files that are not FraiTube sync files', () => {
    expect(() => decodeSyncFile(Buffer.from('plain text'))).toThrow()
    expect(() => decodeSyncFile(gzipSync(JSON.stringify({ ...file, format: 'other' })))).toThrow('Not a FraiTube sync file')
    expect(() => decodeSyncFile(gzipSync(JSON.stringify({ ...file, computerId: 'x' })))).toThrow('Not a FraiTube sync file')
    const badTable = { ...file, changes: [{ ...file.changes[0], table: 'Drop Table' }] }
    expect(() => decodeSyncFile(gzipSync(JSON.stringify(badTable)))).toThrow('Not a FraiTube sync file')
    const removedWithData = { ...file, changes: [{ ...file.changes[1], data: '{}' }] }
    expect(() => decodeSyncFile(gzipSync(JSON.stringify(removedWithData)))).toThrow('Not a FraiTube sync file')
  })

  it('names files so they sort in the order they were written', () => {
    const names = [syncFileName(1_700_000_000_123, 1), syncFileName(999, 0), syncFileName(1_700_000_000_123, 0)]
    expect(names.sort()).toEqual([syncFileName(999, 0), syncFileName(1_700_000_000_123, 0), syncFileName(1_700_000_000_123, 1)])
    expect(names.every(isSyncFileName)).toBe(true)
    expect(isSyncFileName(`${syncFileName(1, 0)}.tmp`)).toBe(false)
  })

  it('knows computer IDs', () => {
    expect(isComputerId('0f0e5b8c-1a2b-4c3d-8e9f-0123456789ab')).toBe(true)
    expect(isComputerId('../other')).toBe(false)
  })
})

describe('isNewer', () => {
  it('prefers the later change, then the higher computer ID', () => {
    expect(isNewer({ changedAt: 2, computerId: 'a' }, { changedAt: 1, computerId: 'b' })).toBe(true)
    expect(isNewer({ changedAt: 1, computerId: 'b' }, { changedAt: 2, computerId: 'a' })).toBe(false)
    expect(isNewer({ changedAt: 1, computerId: 'b' }, { changedAt: 1, computerId: 'a' })).toBe(true)
    expect(isNewer({ changedAt: 1, computerId: 'a' }, { changedAt: 1, computerId: 'a' })).toBe(false)
    expect(isNewer({ changedAt: 1, computerId: 'a' }, undefined)).toBe(true)
  })
})
