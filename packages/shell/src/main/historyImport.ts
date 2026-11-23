import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackArchive, type ArchiveFile, type LoadSevenZip } from '@fraitube/backup'
import { isChannelId } from '@fraitube/subscriptions'
import { isVideoId, videoIdFromLink } from '@fraitube/youtube/ids'
import {
  isHistoryEntry,
  isHistorySeconds,
  MAX_HISTORY_CHANNEL_NAME_LENGTH,
  MAX_HISTORY_TITLE_LENGTH,
  type HistoryEntry,
  type HistoryImportFormat
} from '../shared/history'

/** Largest history file read. */
export const MAX_HISTORY_IMPORT_BYTES = 100 * 1024 * 1024

/** Refuses a history file larger than the import limit. */
export function checkHistoryFileSize(bytes: number): void {
  if (bytes > MAX_HISTORY_IMPORT_BYTES) {
    throw new Error('The file is larger than 100 MB')
  }
}

/** The database inside a NewPipe backup. */
export const NEWPIPE_DATABASE = 'newpipe.db'

/** NewPipe's number for YouTube. */
const NEWPIPE_YOUTUBE_SERVICE = 0

interface RawEntry {
  videoId: unknown
  title: unknown
  channelId: unknown
  channelName: unknown
  durationSeconds: unknown
  watchedAt: unknown
  positionSeconds: unknown
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function seconds(value: unknown): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return isHistorySeconds(number) ? number : 0
}

/** One history entry from another app's data, or undefined when it has no valid video or watch time. */
export function toHistoryEntry(raw: RawEntry): HistoryEntry | undefined {
  if (!isVideoId(raw.videoId) || typeof raw.watchedAt !== 'number' || !Number.isFinite(raw.watchedAt) || raw.watchedAt <= 0) {
    return undefined
  }
  const entry: HistoryEntry = {
    videoId: raw.videoId,
    title: text(raw.title, MAX_HISTORY_TITLE_LENGTH),
    channelId: isChannelId(raw.channelId) ? raw.channelId : '',
    channelName: text(raw.channelName, MAX_HISTORY_CHANNEL_NAME_LENGTH),
    channelAvatar: '',
    durationSeconds: seconds(raw.durationSeconds),
    watchedAt: Math.round(raw.watchedAt),
    positionSeconds: seconds(raw.positionSeconds)
  }
  return isHistoryEntry(entry) ? entry : undefined
}

/** Keeps the latest watch of each video. */
function latestPerVideo(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const latest = new Map<string, HistoryEntry>()
  for (const entry of entries) {
    const known = latest.get(entry.videoId)
    if (!known || entry.watchedAt > known.watchedAt) {
      latest.set(entry.videoId, entry)
    }
  }
  return [...latest.values()]
}

/** Reads a FreeTube history file (.db): one watched video per line. Lines that are not valid are skipped. */
export function parseFreeTubeHistory(fileText: string): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (const line of fileText.split('\n')) {
    if (!line.trim()) {
      continue
    }
    let data: unknown
    try {
      data = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof data !== 'object' || data === null) {
      continue
    }
    const item = data as Record<string, unknown>
    const entry = toHistoryEntry({
      videoId: item['videoId'],
      title: item['title'],
      channelId: item['authorId'],
      channelName: item['author'],
      durationSeconds: item['lengthSeconds'],
      watchedAt: item['timeWatched'],
      positionSeconds: item['watchProgress']
    })
    if (entry) {
      entries.push(entry)
    }
  }
  return latestPerVideo(entries)
}

const NEWPIPE_HISTORY_SQL = `
  SELECT s.url AS url, s.title AS title, s.duration AS duration, s.uploader AS uploader,
    s.uploader_url AS uploaderUrl, MAX(h.access_date) AS watchedAt, st.progress_time AS progress
  FROM streams s
  JOIN stream_history h ON h.stream_id = s.uid
  LEFT JOIN stream_state st ON st.stream_id = s.uid
  WHERE s.service_id = ?
  GROUP BY s.uid`

function channelIdFromUrl(url: unknown): string {
  if (typeof url !== 'string') {
    return ''
  }
  const id = /\/channel\/([\w-]+)\/?$/.exec(url)?.[1]
  return isChannelId(id) ? id : ''
}

/** Reads the YouTube watch history of a NewPipe database file, opened read-only. */
export function readNewPipeDatabase(file: string): HistoryEntry[] {
  let db: DatabaseSync
  try {
    db = new DatabaseSync(file, { readOnly: true })
  } catch {
    throw new Error('The NewPipe backup has no readable database')
  }
  try {
    let rows: Record<string, unknown>[]
    try {
      rows = db.prepare(NEWPIPE_HISTORY_SQL).all(NEWPIPE_YOUTUBE_SERVICE) as Record<string, unknown>[]
    } catch {
      throw new Error('The NewPipe backup has no watch history')
    }
    const entries: HistoryEntry[] = []
    for (const row of rows) {
      const progress = typeof row['progress'] === 'number' ? row['progress'] / 1000 : 0
      const entry = toHistoryEntry({
        videoId: typeof row['url'] === 'string' ? videoIdFromLink(row['url']) : undefined,
        title: row['title'],
        channelId: channelIdFromUrl(row['uploaderUrl']),
        channelName: row['uploader'],
        durationSeconds: row['duration'],
        watchedAt: row['watchedAt'],
        positionSeconds: progress
      })
      if (entry) {
        entries.push(entry)
      }
    }
    return latestPerVideo(entries)
  } finally {
    db.close()
  }
}

/** Reads the YouTube watch history of a NewPipe backup (.zip), through a temporary copy of its database. */
export async function readNewPipeBackup(archive: Uint8Array, tempFolder: string, loadSevenZip: LoadSevenZip): Promise<HistoryEntry[]> {
  let files: ArchiveFile[]
  try {
    files = await unpackArchive(archive, [NEWPIPE_DATABASE], loadSevenZip, 'zip')
  } catch {
    throw new Error('The file is not a NewPipe backup')
  }
  const database = files[0]
  if (!database) {
    throw new Error('The NewPipe backup has no database')
  }
  const folder = await mkdtemp(join(tempFolder, 'fraitube-newpipe-'))
  try {
    const file = join(folder, NEWPIPE_DATABASE)
    await writeFile(file, database.data)
    return readNewPipeDatabase(file)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/** Which app a history file comes from: FreeTube's .db or NewPipe's .zip. */
export function historyFileFormat(fileName: string): HistoryImportFormat {
  const name = fileName.toLowerCase()
  if (name.endsWith('.db')) {
    return 'freetube'
  }
  if (name.endsWith('.zip')) {
    return 'newpipe'
  }
  throw new Error('Choose a FreeTube .db file or a NewPipe .zip backup')
}
