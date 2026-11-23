import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHistoryStore, historySchema } from '../../packages/shell/src/main/historyStore'
import { openStorage, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'history')
const opened: Storage[] = []
const files: string[] = []

function open(): Storage {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  const storage = openStorage(file, [historySchema])
  opened.push(storage)
  return storage
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const file of files.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(file + suffix, { force: true })
    }
  }
})

const hwNews = {
  videoId: 'l8qxFcaLSM4',
  title: 'HW News',
  channelId: 'UChIs72whgZI9w6d6FhwGGHA',
  channelName: 'Gamers Nexus',
  durationSeconds: 2205
}
const ramAltman = { ...hwNews, videoId: 'KNVKzPHgg4M', title: 'RAM Altman', durationSeconds: 900 }

describe('createHistoryStore', () => {
  it('lists the last watched video first', () => {
    let time = 100
    const store = createHistoryStore(open(), () => time++)
    store.record(hwNews)
    store.record(ramAltman)
    store.record(hwNews)
    expect(store.list().map((entry) => entry.videoId)).toEqual([hwNews.videoId, ramAltman.videoId])
    expect(store.list()[0]).toEqual({ ...hwNews, channelAvatar: '', watchedAt: 102, positionSeconds: 0 })
  })

  it('keeps the channel icon given with the video', () => {
    const store = createHistoryStore(open())
    store.record({ ...hwNews, channelAvatar: 'https://yt3.ggpht.com/gn=s88' })
    expect(store.list()[0]?.channelAvatar).toBe('https://yt3.ggpht.com/gn=s88')
  })

  it('keeps the exact saved position when a video is opened again', () => {
    const store = createHistoryStore(open())
    store.record(hwNews)
    store.savePosition(hwNews.videoId, 347.141)
    expect(store.record(hwNews).positionSeconds).toBe(347.141)
    expect(store.list()[0]?.positionSeconds).toBe(347.141)
  })

  it('marks a video not in the history as watched, adding it now with its details', () => {
    const store = createHistoryStore(open(), () => 500)
    store.markWatched({ ...hwNews, durationSeconds: 0 })
    expect(store.list()).toEqual([{ ...hwNews, durationSeconds: 0, channelAvatar: '', watchedAt: 500, positionSeconds: 0, watched: true }])
  })

  it('marks a video in the history as watched, keeping its position, length and watch time', () => {
    let time = 100
    const store = createHistoryStore(open(), () => time++)
    store.record(hwNews)
    store.savePosition(hwNews.videoId, 347.141)
    store.markWatched({ ...hwNews, durationSeconds: 0 })
    expect(store.list()[0]).toMatchObject({ durationSeconds: hwNews.durationSeconds, positionSeconds: 347.141, watchedAt: 100, watched: true })
  })

  it('keeps a video watched when it is played again and starts over', () => {
    const store = createHistoryStore(open())
    store.record(hwNews)
    store.markWatched(hwNews)
    expect(store.record(hwNews).watched).toBe(true)
    store.savePosition(hwNews.videoId, 0)
    store.savePosition(hwNews.videoId, 120)
    expect(store.list()[0]).toMatchObject({ positionSeconds: 120, watched: true })
  })

  it('marks a video as watched once it plays to its end', () => {
    const store = createHistoryStore(open())
    store.record(hwNews)
    store.savePosition(hwNews.videoId, hwNews.durationSeconds)
    expect(store.list()[0]?.watched).toBe(true)
  })

  it('marks a video as unwatched, keeping its position, until it plays to its end again', () => {
    const store = createHistoryStore(open())
    store.record(hwNews)
    store.savePosition(hwNews.videoId, hwNews.durationSeconds)
    store.markUnwatched(hwNews.videoId)
    expect(store.list()[0]).toMatchObject({ positionSeconds: hwNews.durationSeconds, watched: false })
    expect(store.record(hwNews).watched).toBe(false)
    store.savePosition(hwNews.videoId, 0)
    store.savePosition(hwNews.videoId, hwNews.durationSeconds)
    expect(store.list()[0]?.watched).toBe(true)
  })

  it('marks nothing unwatched for a video that is not in the history', () => {
    const store = createHistoryStore(open())
    store.markUnwatched(hwNews.videoId)
    expect(store.list()).toEqual([])
  })

  it('keeps an entry saved before the mark was kept watched when it played to its end and starts over', () => {
    const storage = open()
    storage.records('history').put(hwNews.videoId, { ...hwNews, channelAvatar: '', watchedAt: 1, positionSeconds: hwNews.durationSeconds })
    const store = createHistoryStore(storage)
    expect(store.record(hwNews).watched).toBe(true)
    store.savePosition(hwNews.videoId, 0)
    expect(store.list()[0]?.watched).toBe(true)
  })

  it('saves no position for a video that was never recorded', () => {
    const store = createHistoryStore(open())
    expect(store.savePosition(hwNews.videoId, 10)).toBe(false)
    expect(store.list()).toEqual([])
  })

  it('tells whether a saved position changed, so windows hear only of real changes', () => {
    const store = createHistoryStore(open())
    store.record(hwNews)
    expect(store.savePosition(hwNews.videoId, 347.141)).toBe(true)
    expect(store.savePosition(hwNews.videoId, 347.141)).toBe(false)
  })

  it('imports missing videos and replaces an entry only with a later watch', () => {
    let time = 1000
    const store = createHistoryStore(open(), () => time++)
    store.record({ ...hwNews, channelAvatar: 'https://yt3.ggpht.com/gn=s88' })
    store.record(ramAltman)
    const imported = (videoId: string, watchedAt: number) => ({
      ...hwNews,
      videoId,
      channelAvatar: '',
      watchedAt,
      positionSeconds: 60
    })
    expect(store.import([
      imported(hwNews.videoId, 5000),
      imported(ramAltman.videoId, 10),
      imported('dQw4w9WgXcQ', 20)
    ], 'freetube')).toEqual({ format: 'freetube', total: 3, added: 1, updated: 1, alreadyInHistory: 1 })
    const byId = new Map(store.list().map((entry) => [entry.videoId, entry]))
    expect(byId.get(hwNews.videoId)).toMatchObject({ watchedAt: 5000, positionSeconds: 60, channelAvatar: 'https://yt3.ggpht.com/gn=s88' })
    expect(byId.get(ramAltman.videoId)).toMatchObject({ watchedAt: 1001, positionSeconds: 0 })
    expect(byId.get('dQw4w9WgXcQ')).toMatchObject({ watchedAt: 20 })
  })

  it('leaves removal markers when removing one entry and when clearing', () => {
    const storage = open()
    const store = createHistoryStore(storage)
    store.record(hwNews)
    store.record(ramAltman)
    store.remove(hwNews.videoId)
    expect(store.list().map((entry) => entry.videoId)).toEqual([ramAltman.videoId])
    store.clear()
    expect(store.list()).toEqual([])
    const changes = storage.records('history').changesSince(0)
    expect(changes).toHaveLength(2)
    expect(changes.every((change) => change.removed)).toBe(true)
  })
})
