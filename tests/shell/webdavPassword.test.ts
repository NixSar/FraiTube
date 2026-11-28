import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebdavPasswordStore, type SystemEncryption } from '../../packages/shell/src/main/webdavPassword'
import { TEST_DATA_DIR } from '../paths'

const folders: string[] = []

function newFile(): string {
  const folder = join(TEST_DATA_DIR, 'webdav-password', randomUUID())
  mkdirSync(folder, { recursive: true })
  folders.push(folder)
  return join(folder, 'webdav-password.bin')
}

/** A stand-in for the system's encryption: it reverses the text, so the file never holds it plainly. */
function encryption(available = true): SystemEncryption {
  return {
    isAvailable: () => available,
    encrypt: (text) => Buffer.from([...text].reverse().join(''), 'utf8'),
    decrypt: (data) => [...data.toString('utf8')].reverse().join('')
  }
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
})

describe('the WebDAV password store', () => {
  it('hands the password out only for the address it was saved for', async () => {
    const store = createWebdavPasswordStore(newFile(), encryption())
    expect(await store.forAddress('https://one.example/dav/')).toBeUndefined()

    await store.set(' https://one.example/dav/ ', 'pass word')
    expect(await store.forAddress('https://one.example/dav/')).toBe('pass word')
    expect(await store.forAddress('https://two.example/dav/')).toBeUndefined()
    expect(await store.forAddress('http://one.example/dav/')).toBeUndefined()
  })

  it('keeps the password out of the file as plain text, and removes it for an empty one', async () => {
    const file = newFile()
    const store = createWebdavPasswordStore(file, encryption())
    await store.set('https://one.example/dav/', 'pass word')
    expect(readFileSync(file, 'utf8')).not.toContain('pass word')

    await store.set('https://one.example/dav/', '')
    expect(await store.forAddress('https://one.example/dav/')).toBeUndefined()
    expect(() => readFileSync(file)).toThrow()
  })

  it('refuses to save where the system cannot encrypt', async () => {
    const file = newFile()
    const store = createWebdavPasswordStore(file, encryption(false))
    await expect(store.set('https://one.example/dav/', 'pass word')).rejects.toThrow('no keyring')
    expect(() => readFileSync(file)).toThrow()
  })

  it('answers with nothing for a file it cannot read back', async () => {
    const file = newFile()
    writeFileSync(file, 'not what the store wrote')
    expect(await createWebdavPasswordStore(file, encryption()).forAddress('https://one.example/dav/')).toBeUndefined()
  })
})
