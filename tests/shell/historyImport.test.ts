import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSevenZipFromPackage, packArchive } from '../../packages/backup/src/index'
import {
  checkHistoryFileSize,
  historyFileFormat,
  MAX_HISTORY_IMPORT_BYTES,
  NEWPIPE_DATABASE,
  parseFreeTubeHistory,
  readNewPipeBackup,
  readNewPipeDatabase
} from '../../packages/shell/src/main/historyImport'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'history-import')
const made: string[] = []

function newFolder(): string {
  const folder = join(dir, randomUUID())
  mkdirSync(folder, { recursive: true })
  made.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of made.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
})

const GN = 'UChIs72whgZI9w6d6FhwGGHA'

const freeTubeLine = (fields: Record<string, unknown>): string => JSON.stringify({
  videoId: 'l8qxFcaLSM4',
  title: 'HW News',
  author: 'Gamers Nexus',
  authorId: GN,
  published: 1700000000000,
  description: '',
  viewCount: 100,
  lengthSeconds: 2205,
  watchProgress: 347.5,
  timeWatched: 1763800000000,
  isLive: false,
  type: 'video',
  _id: 'l8qxFcaLSM4',
  ...fields
})

describe('parseFreeTubeHistory', () => {
  it('reads each watched video with its watch time and position', () => {
    expect(parseFreeTubeHistory(`${freeTubeLine({})}\n`)).toEqual([{
      videoId: 'l8qxFcaLSM4',
      title: 'HW News',
      channelId: GN,
      channelName: 'Gamers Nexus',
      channelAvatar: '',
      durationSeconds: 2205,
      watchedAt: 1763800000000,
      positionSeconds: 347.5
    }])
  })

  it('skips broken lines and lines without a valid video or watch time', () => {
    const text = [
      'not json',
      freeTubeLine({ videoId: 'bad' }),
      freeTubeLine({ timeWatched: 'yesterday' }),
      freeTubeLine({ videoId: 'KNVKzPHgg4M', title: 'RAM Altman' }),
      ''
    ].join('\n')
    expect(parseFreeTubeHistory(text).map((entry) => entry.videoId)).toEqual(['KNVKzPHgg4M'])
  })

  it('keeps the latest watch of a video listed twice', () => {
    const text = [freeTubeLine({ timeWatched: 100 }), freeTubeLine({ timeWatched: 300 }), freeTubeLine({ timeWatched: 200 })].join('\n')
    expect(parseFreeTubeHistory(text).map((entry) => entry.watchedAt)).toEqual([300])
  })

  it('cleans up missing or odd values instead of dropping the video', () => {
    const [entry] = parseFreeTubeHistory(freeTubeLine({ authorId: 'bad', lengthSeconds: null, watchProgress: -5, title: 'x'.repeat(600) }))
    expect(entry).toMatchObject({ channelId: '', durationSeconds: 0, positionSeconds: 0 })
    expect(entry?.title).toHaveLength(500)
  })
})

const NEWPIPE_TABLES = `
  CREATE TABLE streams (uid INTEGER PRIMARY KEY, service_id INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
    stream_type TEXT NOT NULL, duration INTEGER NOT NULL, uploader TEXT NOT NULL, uploader_url TEXT, thumbnail_url TEXT);
  CREATE TABLE stream_history (stream_id INTEGER NOT NULL, access_date INTEGER NOT NULL, repeat_count INTEGER NOT NULL,
    PRIMARY KEY (stream_id, access_date));
  CREATE TABLE stream_state (stream_id INTEGER PRIMARY KEY, progress_time INTEGER NOT NULL);`

function makeNewPipeDatabase(folder: string): string {
  const file = join(folder, NEWPIPE_DATABASE)
  const db = new DatabaseSync(file)
  db.exec(NEWPIPE_TABLES)
  const stream = db.prepare('INSERT INTO streams VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  stream.run(1, 0, 'https://www.youtube.com/watch?v=l8qxFcaLSM4', 'HW News', 'VIDEO_STREAM', 2205, 'Gamers Nexus',
    `https://www.youtube.com/channel/${GN}`, '')
  stream.run(2, 0, 'https://www.youtube.com/watch?v=KNVKzPHgg4M', 'RAM Altman', 'VIDEO_STREAM', 900, 'Gamers Nexus',
    'https://www.youtube.com/@GamersNexus', '')
  stream.run(3, 1, 'https://soundcloud.com/someone/track', 'A track', 'AUDIO_STREAM', 200, 'Someone', '', '')
  stream.run(4, 0, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Never watched', 'VIDEO_STREAM', 213, 'Rick', '', '')
  const history = db.prepare('INSERT INTO stream_history VALUES (?, ?, ?)')
  history.run(1, 1763800000000, 1)
  history.run(1, 1763900000000, 2)
  history.run(2, 1763700000000, 1)
  history.run(3, 1763600000000, 1)
  db.prepare('INSERT INTO stream_state VALUES (?, ?)').run(1, 347500)
  db.close()
  return file
}

describe('readNewPipeDatabase', () => {
  it('reads watched YouTube videos with their last watch and position', () => {
    const entries = readNewPipeDatabase(makeNewPipeDatabase(newFolder()))
    expect(entries).toEqual([
      {
        videoId: 'l8qxFcaLSM4',
        title: 'HW News',
        channelId: GN,
        channelName: 'Gamers Nexus',
        channelAvatar: '',
        durationSeconds: 2205,
        watchedAt: 1763900000000,
        positionSeconds: 347.5
      },
      {
        videoId: 'KNVKzPHgg4M',
        title: 'RAM Altman',
        channelId: '',
        channelName: 'Gamers Nexus',
        channelAvatar: '',
        durationSeconds: 900,
        watchedAt: 1763700000000,
        positionSeconds: 0
      }
    ])
  })

  it('refuses a database without watch history', () => {
    const file = join(newFolder(), NEWPIPE_DATABASE)
    const db = new DatabaseSync(file)
    db.exec('CREATE TABLE other (id INTEGER)')
    db.close()
    expect(() => readNewPipeDatabase(file)).toThrow('The NewPipe backup has no watch history')
  })
})

describe('readNewPipeBackup', () => {
  it('reads the database inside the backup and removes its temporary copy', async () => {
    const source = newFolder()
    const database = readFileSync(makeNewPipeDatabase(source))
    const archive = await packArchive([{ name: NEWPIPE_DATABASE, data: database }], loadSevenZipFromPackage, 'zip')
    const temp = newFolder()
    const entries = await readNewPipeBackup(archive, temp, loadSevenZipFromPackage)
    expect(entries.map((entry) => entry.videoId)).toEqual(['l8qxFcaLSM4', 'KNVKzPHgg4M'])
    expect(readdirSync(temp)).toEqual([])
  })

  it('refuses a zip without a NewPipe database and a file that is not a zip', async () => {
    const other = await packArchive([{ name: 'notes.txt', data: new TextEncoder().encode('hello') }], loadSevenZipFromPackage, 'zip')
    await expect(readNewPipeBackup(other, newFolder(), loadSevenZipFromPackage)).rejects.toThrow('The NewPipe backup has no database')
    await expect(readNewPipeBackup(new TextEncoder().encode('not a zip'), newFolder(), loadSevenZipFromPackage))
      .rejects.toThrow('The file is not a NewPipe backup')
  })
})

describe('history files', () => {
  it('tells FreeTube and NewPipe files apart by their kind', () => {
    expect(historyFileFormat('freetube-watch-history-2026-11-22.db')).toBe('freetube')
    expect(historyFileFormat('NewPipeData-20261122_101010.ZIP')).toBe('newpipe')
    expect(() => historyFileFormat('history.json')).toThrow('Choose a FreeTube .db file or a NewPipe .zip backup')
  })

  it('refuses files larger than 100 MB', () => {
    expect(MAX_HISTORY_IMPORT_BYTES).toBe(100 * 1024 * 1024)
    expect(() => checkHistoryFileSize(MAX_HISTORY_IMPORT_BYTES)).not.toThrow()
    expect(() => checkHistoryFileSize(MAX_HISTORY_IMPORT_BYTES + 1)).toThrow('The file is larger than 100 MB')
  })
})
