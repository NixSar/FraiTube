import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { SyncEngine } from './engine'
import { isComputerId, isSyncFileName, MAX_SYNC_FILE_BYTES, SYNC_ROOT_FOLDER } from './format'
import type { SyncResult } from './types'

/** Longest WebDAV request, in milliseconds. */
export const WEBDAV_TIMEOUT_MS = 60_000
/** Largest folder list read from a WebDAV server. */
export const MAX_WEBDAV_LIST_BYTES = 8 * 1024 * 1024

/** Letters, digits and hyphens, with single dots between such runs: every name sync uses fits. */
const SAFE_NAME = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/
const LIST_BODY = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'

export interface WebdavEntry {
  name: string
  isFolder: boolean
}

/** A WebDAV address: http or https, with no user name, password, query or fragment in it. */
export function parseWebdavAddress(address: string): URL | undefined {
  let url: URL
  try {
    url = new URL(address.trim())
  } catch {
    return undefined
  }
  const plain = (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '' && url.search === '' && url.hash === ''
  return plain ? url : undefined
}

/** A path as plain text without the slash folders end in, so two spellings of one path compare equal. */
function decodedPath(path: string): string {
  return path.replace(/\/+$/, '').split('/').map((part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }).join('/')
}

function unescapeXml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/**
 * The entries of a folder in a server's answer to a list request. The folder itself, which servers
 * list first, is left out. An answer that defines text of its own is refused.
 */
export function parseWebdavList(xml: string, folderPath: string): WebdavEntry[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("The WebDAV server's list could not be read")
  }
  const own = decodedPath(folderPath)
  const entries: WebdavEntry[] = []
  for (const response of xml.match(/<(?:[\w.-]+:)?response[\s>][\s\S]*?<\/(?:[\w.-]+:)?response\s*>/gi) ?? []) {
    const href = /<(?:[\w.-]+:)?href[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href\s*>/i.exec(response)?.[1]
    if (href === undefined) {
      continue
    }
    const text = unescapeXml(href.trim())
    let path: string
    try {
      path = /^https?:\/\//i.test(text) ? new URL(text).pathname : text.split('?')[0] ?? ''
    } catch {
      continue
    }
    const decoded = decodedPath(path)
    if (decoded !== own) {
      const type = /<(?:[\w.-]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?resourcetype\s*>/i.exec(response)?.[1] ?? ''
      entries.push({ name: decoded.slice(decoded.lastIndexOf('/') + 1), isFolder: /<(?:[\w.-]+:)?collection[\s/>]/i.test(type) })
    }
  }
  return entries
}

function failure(status: number): Error {
  if (status === 401 || status === 403) return new Error('The WebDAV server refused the user name or password')
  if (status === 404 || status === 409) return new Error('The WebDAV server has no such folder')
  if (status === 507) return new Error('The WebDAV server is full')
  return new Error(`The WebDAV server answered ${status}`)
}

/** Reads an answer's body, and fails once it is larger than allowed. */
async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) {
    return new Uint8Array(0)
  }
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.length
    if (total > limit) {
      await reader.cancel()
      throw new Error('The WebDAV server sent more than FraiTube accepts')
    }
    parts.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    all.set(part, offset)
    offset += part.length
  }
  return all
}

/**
 * A folder on a WebDAV server, such as a Nextcloud account or a home storage box. Every request
 * carries the user name and password, goes only to the address given, and follows no redirect, which
 * could carry the password elsewhere. Paths are lists of names below that address.
 */
export class WebdavRemote {
  private readonly base: URL
  private readonly login: string | undefined

  constructor(address: string, user: string, password: string, private readonly send: typeof fetch = fetch) {
    const base = parseWebdavAddress(address)
    if (!base) {
      throw new Error('The WebDAV address is not a web address')
    }
    this.base = base
    this.login = user === '' ? undefined : `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`
  }

  private url(path: readonly string[], folder: boolean): URL {
    for (const name of path) {
      // A name with a slash or made of dots would change which folder the request reaches.
      if (!SAFE_NAME.test(name)) {
        throw new Error('The WebDAV server listed a name that cannot be used')
      }
    }
    const url = new URL(this.base.href)
    url.pathname = [this.base.pathname.replace(/\/+$/, ''), ...path.map(encodeURIComponent)].join('/') + (folder ? '/' : '')
    return url
  }

  private async request(method: string, url: URL, body?: Uint8Array | string, headers: Record<string, string> = {}): Promise<Response> {
    try {
      return await this.send(url, {
        method,
        body: body as RequestInit['body'],
        redirect: 'manual',
        headers: { ...(this.login ? { authorization: this.login } : {}), ...headers },
        signal: AbortSignal.timeout(WEBDAV_TIMEOUT_MS)
      })
    } catch (cause) {
      const detail = cause instanceof Error && cause.cause instanceof Error ? cause.cause.message : cause instanceof Error ? cause.message : String(cause)
      throw new Error(`The WebDAV server could not be reached: ${detail}`, { cause })
    }
  }

  /** What a folder holds. Throws when the folder does not exist. */
  async list(folder: readonly string[]): Promise<WebdavEntry[]> {
    const url = this.url(folder, true)
    const response = await this.request('PROPFIND', url, LIST_BODY, { depth: '1', 'content-type': 'application/xml; charset=utf-8' })
    if (response.status !== 207) {
      await response.body?.cancel()
      throw failure(response.status)
    }
    return parseWebdavList(new TextDecoder().decode(await readLimited(response, MAX_WEBDAV_LIST_BYTES)), url.pathname)
  }

  /** Makes a folder whose parent exists. Does nothing when it is there already. */
  async makeFolder(folder: readonly string[]): Promise<void> {
    const response = await this.request('MKCOL', this.url(folder, true))
    await response.body?.cancel()
    // 405 is the answer for a folder that is there already.
    if (!response.ok && response.status !== 405) {
      throw failure(response.status)
    }
  }

  async read(file: readonly string[]): Promise<Uint8Array> {
    const response = await this.request('GET', this.url(file, false))
    if (response.status !== 200) {
      await response.body?.cancel()
      throw failure(response.status)
    }
    return readLimited(response, MAX_SYNC_FILE_BYTES)
  }

  /** Writes a file, replacing one of the same name. */
  async write(data: Uint8Array, file: readonly string[]): Promise<void> {
    const response = await this.request('PUT', this.url(file, false), data, { 'content-type': 'application/octet-stream' })
    await response.body?.cancel()
    if (!response.ok) {
      throw failure(response.status)
    }
  }

  /** Gives a file a new name in the same folder. */
  async rename(file: readonly string[], newName: string): Promise<void> {
    const destination = this.url([...file.slice(0, -1), newName], false)
    const response = await this.request('MOVE', this.url(file, false), undefined, { destination: destination.href, overwrite: 'T' })
    await response.body?.cancel()
    if (!response.ok) {
      throw failure(response.status)
    }
  }

  /** Deletes a file. Does nothing when it is gone already. */
  async delete(file: readonly string[]): Promise<void> {
    const response = await this.request('DELETE', this.url(file, false))
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) {
      throw failure(response.status)
    }
  }
}

/** True when the data is a whole gzip file within the engine's size limit, as every sync file is. */
function unpacks(data: Uint8Array): boolean {
  try {
    gunzipSync(data, { maxOutputLength: MAX_SYNC_FILE_BYTES })
    return true
  } catch {
    return false
  }
}

/** A name of a sync file being sent: it gets its real name once it has arrived whole. */
function isSendingName(name: string): boolean {
  return name.endsWith('.tmp') && isSyncFileName(name.slice(0, -'.tmp'.length))
}

/** Brings the local copies of the other computers' folders in step with the server. */
export async function pullFromWebdav(remote: WebdavRemote, staging: string, ownId: string): Promise<void> {
  await remote.makeFolder([SYNC_ROOT_FOLDER])
  const computers = (await remote.list([SYNC_ROOT_FOLDER])).filter((entry) => entry.isFolder && isComputerId(entry.name) && entry.name !== ownId)
  for (const computer of computers) {
    const folder = join(staging, computer.name)
    await mkdir(folder, { recursive: true })
    const names = new Set((await remote.list([SYNC_ROOT_FOLDER, computer.name])).filter((entry) => !entry.isFolder && isSyncFileName(entry.name)).map((entry) => entry.name))
    const have = new Set(await readdir(folder))
    for (const name of names) {
      if (have.has(name)) {
        continue
      }
      let data: Uint8Array
      try {
        data = await remote.read([SYNC_ROOT_FOLDER, computer.name, name])
      } catch {
        // A file that cannot be read now is left for the next run; the others still sync.
        continue
      }
      // A cut-off or damaged download is dropped, so the next run fetches it again.
      if (!unpacks(data)) {
        continue
      }
      // Written under another name first, so the engine never reads half a file.
      const part = join(folder, `${name}.part`)
      await writeFile(part, data)
      await rename(part, join(folder, name))
    }
    for (const name of await readdir(folder)) {
      if (!names.has(name)) {
        await rm(join(folder, name), { force: true })
      }
    }
  }
  // A computer whose folder is gone from the server is no longer merged from an old local copy.
  const listed = new Set(computers.map((computer) => computer.name))
  for (const entry of await readdir(staging, { withFileTypes: true })) {
    if (entry.isDirectory() && isComputerId(entry.name) && entry.name !== ownId && !listed.has(entry.name)) {
      await rm(join(staging, entry.name), { recursive: true, force: true })
    }
  }
}

/** Brings this computer's folder on the server in step with the local one. Only this computer ever changes it. */
export async function pushToWebdav(remote: WebdavRemote, staging: string, ownId: string): Promise<void> {
  const folder = join(staging, ownId)
  await mkdir(folder, { recursive: true })
  const names = (await readdir(folder)).filter(isSyncFileName).sort()
  await remote.makeFolder([SYNC_ROOT_FOLDER])
  await remote.makeFolder([SYNC_ROOT_FOLDER, ownId])
  // Only names shaped like sync files, or like one being sent, are ever touched on the server.
  const there = new Set((await remote.list([SYNC_ROOT_FOLDER, ownId])).filter((entry) => !entry.isFolder && (isSyncFileName(entry.name) || isSendingName(entry.name))).map((entry) => entry.name))
  for (const name of names) {
    if (!there.has(name)) {
      // Sent under another name first, so no other computer ever reads half a file.
      const part = `${name}.tmp`
      await remote.write(new Uint8Array(await readFile(join(folder, name))), [SYNC_ROOT_FOLDER, ownId, part])
      await remote.rename([SYNC_ROOT_FOLDER, ownId, part], name)
    }
  }
  const kept = new Set(names)
  for (const name of there) {
    if (!kept.has(name)) {
      await remote.delete([SYNC_ROOT_FOLDER, ownId, name])
    }
  }
}

export interface WebdavSyncOptions {
  /** The address of the folder on the server that holds the FraiTube folder. */
  address: string
  user: string
  password: string
  /** A local folder that mirrors the server's FraiTube folder. */
  staging: string
  computerId: string
  fetch?: typeof fetch
}

/** Syncs through the FraiTube folder at a WebDAV address, mirrored in a local staging folder. */
export async function syncWithWebdav(engine: SyncEngine, options: WebdavSyncOptions): Promise<SyncResult> {
  if (!isComputerId(options.computerId)) {
    throw new Error('Invalid computer ID')
  }
  const remote = new WebdavRemote(options.address, options.user, options.password, options.fetch)
  await mkdir(join(options.staging, options.computerId), { recursive: true })
  await pullFromWebdav(remote, options.staging, options.computerId)
  try {
    return await engine.run(options.staging)
  } finally {
    // The engine writes this computer's file and marks its changes as sent before it reads the other
    // computers' files, so the copy out happens also when that reading fails.
    await pushToWebdav(remote, options.staging, options.computerId)
  }
}
