import { createRecordTableSql, type ModuleSchema, type Storage } from '@fraitube/storage'
import { isFavorite, type Favorite } from '../shared/favorites'
import type { HistoryVideo } from '../shared/history'

/** One record per favorite video, keyed by video ID. Removing one leaves a removal marker for sync. */
export const favoritesSchema: ModuleSchema = {
  module: 'favorites',
  migrations: [{ version: 1, up: createRecordTableSql('favorites') }],
  synced: ['favorites']
}

export interface FavoritesStore {
  /** Every favorite, the last added first. */
  list(): Favorite[]
  /** Adds a video to the favorites, marked as a short when it is one; a video already there keeps when it was added. */
  add(video: HistoryVideo): void
  remove(videoId: string): void
}

export function createFavoritesStore(storage: Storage, now: () => number = Date.now): FavoritesStore {
  const table = storage.records<Favorite>('favorites')

  function current(videoId: string): Favorite | undefined {
    const stored = table.get(videoId)
    return isFavorite(stored) ? stored : undefined
  }

  return {
    list() {
      return table.list()
        .map((record) => record.value)
        .filter(isFavorite)
        .sort((a, b) => b.addedAt - a.addedAt)
    },
    add(video) {
      if (current(video.videoId)) {
        return
      }
      table.put(video.videoId, {
        videoId: video.videoId,
        title: video.title,
        channelId: video.channelId,
        channelName: video.channelName,
        channelAvatar: video.channelAvatar ?? '',
        durationSeconds: video.durationSeconds,
        addedAt: now(),
        ...(video.short === true ? { short: true } : {})
      })
    },
    remove(videoId) {
      if (current(videoId)) {
        table.remove(videoId)
      }
    }
  }
}
