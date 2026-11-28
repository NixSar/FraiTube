import { gunzipSync as nodeGunzip, gzipSync as nodeGzip } from 'node:zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { join } from '../../packages/android-web/src/shims/path'
import { gunzipSync, gzipSync } from '../../packages/android-web/src/shims/zlib'

/** A stand-in for the Android side's sync folder, held in memory. */
const stored = new Map<string, string | null>()

function syncFile(op: string, path: string, arg: string): string {
  const answer = (value: unknown): string => JSON.stringify({ value })
  switch (op) {
    case 'mkdir':
      stored.set(path, null)
      return answer('')
    case 'readdir': {
      if (stored.get(path) !== null) {
        return JSON.stringify({ error: 'The folder does not exist' })
      }
      const names = [...stored.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      return answer(names.sort().map((key) => ({ name: key.slice(path.length + 1), folder: stored.get(key) === null })))
    }
    case 'readFile':
      return typeof stored.get(path) === 'string' ? answer(stored.get(path)) : JSON.stringify({ error: 'The file does not exist' })
    case 'writeFile':
      stored.set(path, arg)
      return answer('')
    case 'rename':
      stored.set(arg, stored.get(path) ?? '')
      stored.delete(path)
      return answer('')
    case 'rm':
      stored.delete(path)
      return answer('')
    default:
      return JSON.stringify({ error: 'Unknown sync file call' })
  }
}

Object.assign(globalThis, { window: { FraiTubeNative: { syncFile } } })
const fs = await import('../../packages/android-web/src/shims/fs')

beforeEach(() => {
  stored.clear()
})

describe('the path stand-in', () => {
  it('joins names with single slashes', () => {
    expect(join('FraiTube', 'abc')).toBe('FraiTube/abc')
    expect(join('FraiTube/', '/abc', 'file.json.gz')).toBe('FraiTube/abc/file.json.gz')
    expect(join('a', '.', 'b', '..', 'c')).toBe('a/c')
  })
})

describe('the gzip stand-in', () => {
  it('packs what Node unpacks, and unpacks what Node packs', () => {
    const text = JSON.stringify({ format: 'fraitube-sync', changes: ['ž', 'č'] })
    expect(nodeGunzip(gzipSync(text)).toString('utf8')).toBe(text)
    expect(gunzipSync(new Uint8Array(nodeGzip(text))).toString()).toBe(text)
  })

  it('refuses data that unpacks to more than the limit, and data that is not gzip', () => {
    const packed = gzipSync('x'.repeat(5000))
    expect(() => gunzipSync(packed, { maxOutputLength: 1000 })).toThrow('larger than allowed')
    expect(gunzipSync(packed, { maxOutputLength: 5000 })).toHaveLength(5000)
    expect(() => gunzipSync(new Uint8Array([1, 2, 3]))).toThrow()
  })
})

describe('the file stand-in', () => {
  it('writes, lists, reads, renames and deletes files through the Android side', async () => {
    await fs.mkdir('FraiTube')
    await fs.mkdir('FraiTube/abc')
    await fs.writeFile('FraiTube/abc/one.tmp', new Uint8Array([0, 1, 2, 250, 255]))
    await fs.rename('FraiTube/abc/one.tmp', 'FraiTube/abc/one')

    expect(await fs.readdir('FraiTube/abc')).toEqual(['one'])
    expect([...await fs.readFile('FraiTube/abc/one')]).toEqual([0, 1, 2, 250, 255])

    const entries = await fs.readdir('FraiTube', { withFileTypes: true })
    expect(entries.map((entry) => [entry.name, entry.isDirectory()])).toEqual([['abc', true]])

    await fs.rm('FraiTube/abc/one')
    expect(await fs.readdir('FraiTube/abc')).toEqual([])
  })

  it('throws the Android side\'s error', async () => {
    await expect(fs.readdir('missing')).rejects.toThrow('The folder does not exist')
    await expect(fs.readFile('missing')).rejects.toThrow('The file does not exist')
  })
})
