import { createServer, type Server } from 'node:http'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyncEngine } from '../../packages/sync/src/engine'
import { parseWebdavAddress, parseWebdavList, pullFromWebdav, pushToWebdav, syncWithWebdav, WebdavRemote } from '../../packages/sync/src/webdav'
import { TEST_DATA_DIR } from '../paths'

const OWN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const FILE_1 = '000001700000001-0000.json.gz'
const FILE_2 = '000001700000002-0000.json.gz'
const FILE_3 = '000001700000003-0000.json.gz'
const ROOT = '/dav/files/tester'
const LOGIN = `Basic ${Buffer.from('tester:pass word').toString('base64')}`

/** A small WebDAV server kept in memory: folders, files, and the request kinds the app sends. */
const folders = new Set<string>()
const files = new Map<string, Buffer>()
const logins = new Set<string>()
let refuse = false
let server: Server
let address = ''
let staging = ''

const parent = (path: string): string => path.slice(0, path.lastIndexOf('/'))
const pack = (text: string): Buffer => gzipSync(text)
const unpack = (file: string): string => gunzipSync(readFileSync(file)).toString('utf8')

beforeEach(async () => {
  folders.clear()
  files.clear()
  logins.clear()
  refuse = false
  for (const folder of ['/dav', '/dav/files', ROOT]) folders.add(folder)
  server = createServer((request, response) => {
    const parts: Buffer[] = []
    request.on('data', (part: Buffer) => parts.push(part))
    request.on('end', () => {
      const answer = (status: number, body: string | Buffer = '', headers: Record<string, string> = {}): void => {
        response.writeHead(status, headers)
        response.end(body)
      }
      if (refuse) return answer(401)
      if (request.headers.authorization) logins.add(request.headers.authorization)
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname).replace(/\/+$/, '')
      switch (request.method) {
        case 'PROPFIND': {
          if (!folders.has(path)) return answer(404)
          const entry = (href: string, folder: boolean): string =>
            `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype>${folder ? '<d:collection/>' : ''}</d:resourcetype></d:prop></d:propstat></d:response>`
          const body = [
            entry(`${path}/`, true),
            ...[...folders].filter((folder) => parent(folder) === path).map((folder) => entry(`${folder}/`, true)),
            ...[...files.keys()].filter((file) => parent(file) === path).map((file) => entry(file, false))
          ].join('')
          return answer(207, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${body}</d:multistatus>`, { 'content-type': 'application/xml' })
        }
        case 'MKCOL':
          if (folders.has(path)) return answer(405)
          if (!folders.has(parent(path))) return answer(409)
          folders.add(path)
          return answer(201)
        case 'PUT':
          if (!folders.has(parent(path))) return answer(409)
          files.set(path, Buffer.concat(parts))
          return answer(201)
        case 'GET': {
          const file = files.get(path)
          return file ? answer(200, file) : answer(404)
        }
        case 'DELETE':
          return files.delete(path) ? answer(204) : answer(404)
        case 'MOVE': {
          const file = files.get(path)
          if (!file) return answer(404)
          files.delete(path)
          files.set(decodeURIComponent(new URL(String(request.headers.destination)).pathname), file)
          return answer(201)
        }
        default:
          return answer(405)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  address = `http://127.0.0.1:${(server.address() as AddressInfo).port}${ROOT}/`
  staging = join(TEST_DATA_DIR, 'webdav', randomUUID())
  mkdirSync(staging, { recursive: true })
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  rmSync(staging, { recursive: true, force: true })
})

function remote(): WebdavRemote {
  return new WebdavRemote(address, 'tester', 'pass word')
}

describe('WebDAV sync', () => {
  it('copies the other computers\' files in and this computer\'s out', async () => {
    folders.add(`${ROOT}/FraiTube`)
    folders.add(`${ROOT}/FraiTube/${OTHER}`)
    folders.add(`${ROOT}/FraiTube/notes`)
    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_1}`, pack('one'))
    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_2}`, pack('two'))
    files.set(`${ROOT}/FraiTube/${OTHER}/readme.txt`, Buffer.from('stray'))

    await pullFromWebdav(remote(), staging, OWN)
    expect(readdirSync(join(staging, OTHER)).sort()).toEqual([FILE_1, FILE_2])
    expect(unpack(join(staging, OTHER, FILE_1))).toBe('one')
    expect(readdirSync(staging)).toEqual([OTHER])

    // The other computer replaces its files by one; the local copy follows.
    files.delete(`${ROOT}/FraiTube/${OTHER}/${FILE_1}`)
    files.delete(`${ROOT}/FraiTube/${OTHER}/${FILE_2}`)
    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_3}`, pack('three'))
    await pullFromWebdav(remote(), staging, OWN)
    expect(readdirSync(join(staging, OTHER))).toEqual([FILE_3])

    // This computer's files go out, and one it no longer has is removed there.
    mkdirSync(join(staging, OWN))
    writeFileSync(join(staging, OWN, FILE_1), pack('mine one'))
    writeFileSync(join(staging, OWN, FILE_2), pack('mine two'))
    await pushToWebdav(remote(), staging, OWN)
    const mine = (): string[] => [...files.keys()].filter((file) => parent(file) === `${ROOT}/FraiTube/${OWN}`).map((file) => file.slice(file.lastIndexOf('/') + 1)).sort()
    expect(mine()).toEqual([FILE_1, FILE_2])
    expect(gunzipSync(files.get(`${ROOT}/FraiTube/${OWN}/${FILE_2}`) ?? Buffer.alloc(0)).toString('utf8')).toBe('mine two')

    rmSync(join(staging, OWN, FILE_1))
    await pushToWebdav(remote(), staging, OWN)
    expect(mine()).toEqual([FILE_2])

    // Every request carried the login.
    expect([...logins]).toEqual([LOGIN])
  })

  it('skips a damaged file until it is whole, and leaves other names on the server alone', async () => {
    folders.add(`${ROOT}/FraiTube`)
    folders.add(`${ROOT}/FraiTube/${OTHER}`)
    folders.add(`${ROOT}/FraiTube/${OWN}`)
    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_1}`, pack('one'))
    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_2}`, Buffer.from('cut off, not a gzip file'))
    files.set(`${ROOT}/FraiTube/${OWN}/notes.txt`, Buffer.from('not a sync file'))

    await pullFromWebdav(remote(), staging, OWN)
    expect(readdirSync(join(staging, OTHER))).toEqual([FILE_1])

    files.set(`${ROOT}/FraiTube/${OTHER}/${FILE_2}`, pack('two'))
    await pullFromWebdav(remote(), staging, OWN)
    expect(readdirSync(join(staging, OTHER)).sort()).toEqual([FILE_1, FILE_2])

    mkdirSync(join(staging, OWN), { recursive: true })
    writeFileSync(join(staging, OWN, FILE_3), pack('mine'))
    await pushToWebdav(remote(), staging, OWN)
    expect(files.has(`${ROOT}/FraiTube/${OWN}/notes.txt`)).toBe(true)
    expect(files.has(`${ROOT}/FraiTube/${OWN}/${FILE_3}`)).toBe(true)
  })

  it('forgets the local copy of a computer whose folder is gone from the server', async () => {
    folders.add(`${ROOT}/FraiTube`)
    mkdirSync(join(staging, OTHER))
    writeFileSync(join(staging, OTHER, FILE_1), pack('old'))
    mkdirSync(join(staging, OWN))
    writeFileSync(join(staging, OWN, FILE_1), pack('mine'))

    await pullFromWebdav(remote(), staging, OWN)
    expect(readdirSync(staging)).toEqual([OWN])
  })

  it('copies out also when the engine fails after writing this computer\'s file', async () => {
    const engine: SyncEngine = {
      async run(root) {
        mkdirSync(join(root, OWN), { recursive: true })
        writeFileSync(join(root, OWN, FILE_1), pack('mine'))
        throw new Error('reading the others failed')
      }
    }
    await expect(syncWithWebdav(engine, { address, user: 'tester', password: 'pass word', staging, computerId: OWN })).rejects.toThrow('reading the others failed')
    expect(files.has(`${ROOT}/FraiTube/${OWN}/${FILE_1}`)).toBe(true)
  })

  it('reports a refused login and a missing folder', async () => {
    refuse = true
    await expect(remote().list(['FraiTube'])).rejects.toThrow('refused the user name or password')
    refuse = false
    await expect(remote().list(['nowhere'])).rejects.toThrow('has no such folder')
  })

  it('refuses a name that would leave its folder', async () => {
    for (const name of ['.', '.'.repeat(2), 'a/b', '']) {
      await expect(remote().delete(['FraiTube', OWN, name])).rejects.toThrow('listed a name that cannot be used')
    }
  })
})

describe('WebDAV addresses and lists', () => {
  it('takes http and https addresses without a login, query or fragment in them', () => {
    expect(parseWebdavAddress('https://example.org/remote.php/dav/files/name')).toBeDefined()
    expect(parseWebdavAddress(' http://192.168.1.10:8080/dav/ ')).toBeDefined()
    expect(parseWebdavAddress('ftp://example.org/dav')).toBeUndefined()
    expect(parseWebdavAddress('https://name:secret@example.org/dav')).toBeUndefined()
    expect(parseWebdavAddress('https://example.org/dav?x=1')).toBeUndefined()
    expect(parseWebdavAddress('not an address')).toBeUndefined()
  })

  it('reads lists with full addresses and encoded names, and leaves the folder itself out', () => {
    const xml = `<?xml version="1.0"?>
      <D:multistatus xmlns:D="DAV:">
        <D:response><D:href>https://example.org/dav/My%20Files/</D:href>
          <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
        <D:response><D:href>/dav/My%20Files/a%2Bb.json.gz</D:href>
          <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat></D:response>
        <D:response><D:href>/dav/My Files/sub/</D:href>
          <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
      </D:multistatus>`
    expect(parseWebdavList(xml, '/dav/My%20Files/')).toEqual([{ name: 'a+b.json.gz', isFolder: false }, { name: 'sub', isFolder: true }])
  })

  it('refuses a list that defines text of its own', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaa">]><D:multistatus xmlns:D="DAV:"></D:multistatus>'
    expect(() => parseWebdavList(xml, '/dav/')).toThrow('could not be read')
  })
})
