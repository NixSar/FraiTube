import { gunzipSync, gzipSync } from 'node:zlib'
import { isSafeName } from '@fraitube/storage'
import type { SyncChange, SyncFile } from './types'

/** The folder inside the sync location that holds one folder per computer. */
export const SYNC_ROOT_FOLDER = 'FraiTube'

/** Largest sync file read, compressed and uncompressed. */
export const MAX_SYNC_FILE_BYTES = 64 * 1024 * 1024

const FILE_NAME = /^(\d{15})-(\d{4})\.json\.gz$/
const COMPUTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_KEY_LENGTH = 1000

export function isComputerId(value: unknown): value is string {
  return typeof value === 'string' && COMPUTER_ID.test(value)
}

/** A file name that sorts in the order the files were written. */
export function syncFileName(createdAt: number, sequence: number): string {
  return `${String(Math.max(0, Math.floor(createdAt))).padStart(15, '0')}-${String(sequence % 10000).padStart(4, '0')}.json.gz`
}

export function isSyncFileName(name: string): boolean {
  return FILE_NAME.test(name)
}

export function encodeSyncFile(file: SyncFile): Buffer {
  return gzipSync(JSON.stringify(file))
}

/** How far ahead of this computer's clock a change's time may lie: room for clocks that differ. */
const MAX_AHEAD_MS = 24 * 60 * 60 * 1000

/** True for a text the record tables can read back, which is JSON. */
function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * A change is taken only when the stores can live with it: its data reads back as JSON, and its time
 * is not far in the future, where it would win over every later change.
 */
function isChange(value: unknown, latest: number): value is SyncChange {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const change = value as Partial<SyncChange>
  return typeof change.table === 'string' && isSafeName(change.table) &&
    typeof change.key === 'string' && change.key.length > 0 && change.key.length <= MAX_KEY_LENGTH &&
    typeof change.changedAt === 'number' && Number.isSafeInteger(change.changedAt) && change.changedAt > 0 &&
    change.changedAt <= latest &&
    typeof change.removed === 'boolean' &&
    (change.removed ? change.data === null : typeof change.data === 'string' && isJson(change.data))
}

/** Reads a sync file. Throws for a file that is not a valid sync file. */
export function decodeSyncFile(content: Buffer, now: number = Date.now()): SyncFile {
  const latest = now + MAX_AHEAD_MS
  if (content.length > MAX_SYNC_FILE_BYTES) {
    throw new Error('The sync file is too large')
  }
  const data = JSON.parse(gunzipSync(content, { maxOutputLength: MAX_SYNC_FILE_BYTES }).toString('utf8')) as Partial<SyncFile>
  if (
    data.format !== 'fraitube-sync' ||
    data.version !== 1 ||
    !isComputerId(data.computerId) ||
    typeof data.createdAt !== 'number' ||
    !Array.isArray(data.changes) ||
    !data.changes.every((change) => isChange(change, latest))
  ) {
    throw new Error('Not a FraiTube sync file')
  }
  return data as SyncFile
}
