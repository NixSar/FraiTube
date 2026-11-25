import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFavoritesStore, favoritesSchema } from '../../packages/shell/src/main/favoritesStore'
import { favoriteAction } from '../../packages/shell/src/renderer/modules/favorites/store'
import { isFavorite } from '../../packages/shell/src/shared/favorites'
import { openStorage, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'favorites')
const opened: Storage[] = []
const files: string[] = []

function open(): Storage {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  const storage = openStorage(file, [favoritesSchema])
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
const ramAltman = { ...hwNews, videoId: 'KNVKzPHgg4M', title: 'RAM Altman', durationSeconds: 0 }

describe('createFavoritesStore', () => {
  it('lists the last added favorite first, with its details', () => {
    let time = 100
    const store = createFavoritesStore(open(), () => time++)
    store.add(hwNews)
    store.add(ramAltman)
    expect(store.list().map((favorite) => favorite.videoId)).toEqual([ramAltman.videoId, hwNews.videoId])
    expect(store.list()[1]).toEqual({ ...hwNews, channelAvatar: '', addedAt: 100 })
  })

  it('marks a short added as a short, and reads favorites saved without the mark as videos', () => {
    const storage = open()
    storage.records('favorites').put(ramAltman.videoId, { ...ramAltman, channelAvatar: '', addedAt: 1 })
    const store = createFavoritesStore(storage, () => 100)
    store.add({ ...hwNews, short: true })
    expect(store.list().map((favorite) => [favorite.videoId, favorite.short])).toEqual([[hwNews.videoId, true], [ramAltman.videoId, undefined]])
    expect(isFavorite({ ...hwNews, addedAt: 1, short: 'yes' })).toBe(false)
  })

  it('keeps when a video was added when it is added again', () => {
    let time = 100
    const store = createFavoritesStore(open(), () => time++)
    store.add(hwNews)
    store.add(ramAltman)
    store.add(hwNews)
    expect(store.list().map((favorite) => favorite.videoId)).toEqual([ramAltman.videoId, hwNews.videoId])
  })

  it('leaves a removal marker when removing, and removes nothing that is not a favorite', () => {
    const storage = open()
    const store = createFavoritesStore(storage)
    store.add(hwNews)
    store.remove(ramAltman.videoId)
    store.remove(hwNews.videoId)
    expect(store.list()).toEqual([])
    const changes = storage.records('favorites').changesSince(0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ key: hwNews.videoId, removed: true })
  })

  it('is synced', () => {
    expect(favoritesSchema.synced).toEqual(['favorites'])
  })
})

describe('isFavorite', () => {
  it('accepts a video with the time it was added, and refuses one without', () => {
    expect(isFavorite({ ...hwNews, addedAt: 1 })).toBe(true)
    expect(isFavorite(hwNews)).toBe(false)
    expect(isFavorite({ ...hwNews, videoId: 'bad', addedAt: 1 })).toBe(false)
  })
})

describe('favoriteAction', () => {
  it('offers adding a video that is not a favorite, and removing one that is', () => {
    expect(favoriteAction(false)).toEqual({ label: 'Add to favorites', add: true })
    expect(favoriteAction(true)).toEqual({ label: 'Remove from favorites', add: false })
  })
})
