import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackArchive, type ArchiveFile } from '@fraitube/backup'
import type { HistoryEntry } from '../shared/history'
import { NEWPIPE_DATABASE, NEWPIPE_HISTORY_SQL, NEWPIPE_YOUTUBE_SERVICE, newPipeEntries } from './historyFiles'

export * from './historyFiles'

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
    return newPipeEntries(rows)
  } finally {
    db.close()
  }
}

/** Reads the YouTube watch history of a NewPipe backup (.zip), through a temporary copy of its database. */
export async function readNewPipeBackup(archive: Uint8Array, tempFolder: string): Promise<HistoryEntry[]> {
  let files: ArchiveFile[]
  try {
    files = unpackArchive(archive, [NEWPIPE_DATABASE])
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
