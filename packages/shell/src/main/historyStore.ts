import { createRecordTableSql, type ModuleSchema, type Storage } from '@fraitube/storage'
import {
  isHistoryEntry,
  isWatched,
  withSavedPosition,
  type HistoryEntry,
  type HistoryImportFormat,
  type HistoryImportSummary,
  type HistoryVideo
} from '../shared/history'

/** One record per watched video, keyed by video ID. Removing an entry leaves a removal marker for sync. */
export const historySchema: ModuleSchema = {
  module: 'history',
  migrations: [{ version: 1, up: createRecordTableSql('history') }],
  synced: ['history']
}

export interface HistoryStore {
  /** Every watched video, last watched first. */
  list(): HistoryEntry[]
  /** Records that a video was opened now, keeping its saved position and watched state. */
  record(video: HistoryVideo): HistoryEntry
  /** Saves where a recorded video stopped; a position at its end marks it as watched. True when the saved position changed. */
  savePosition(videoId: string, positionSeconds: number): boolean
  /** Adds videos from another app: missing ones are added, and an entry is replaced only by a later watch. */
  import(entries: readonly HistoryEntry[], format: HistoryImportFormat): HistoryImportSummary
  /** Marks a video as watched, adding it to the history when it is not there. */
  markWatched(video: HistoryVideo): void
  /** Marks a video as unwatched, keeping its entry and position. */
  markUnwatched(videoId: string): void
  remove(videoId: string): void
  clear(): void
}

export function createHistoryStore(storage: Storage, now: () => number = Date.now): HistoryStore {
  const table = storage.records<HistoryEntry>('history')

  function current(videoId: string): HistoryEntry | undefined {
    const stored = table.get(videoId)
    return isHistoryEntry(stored) ? stored : undefined
  }

  return {
    list() {
      return table.list()
        .map((record) => record.value)
        .filter(isHistoryEntry)
        .sort((a, b) => b.watchedAt - a.watchedAt)
    },
    record(video) {
      const known = current(video.videoId)
      const entry: HistoryEntry = {
        videoId: video.videoId,
        title: video.title,
        channelId: video.channelId,
        channelName: video.channelName,
        channelAvatar: video.channelAvatar ?? '',
        durationSeconds: video.durationSeconds,
        watchedAt: now(),
        positionSeconds: known?.positionSeconds ?? 0
      }
      // The watched state stays. An entry saved before the mark was kept gets it here when it played to
      // its end, so starting it over keeps it watched.
      if (known?.watched !== undefined) {
        entry.watched = known.watched
      } else if (known && isWatched(known)) {
        entry.watched = true
      }
      table.put(video.videoId, entry)
      return entry
    },
    savePosition(videoId, positionSeconds) {
      const entry = current(videoId)
      if (entry && entry.positionSeconds !== positionSeconds) {
        table.put(videoId, withSavedPosition(entry, positionSeconds))
        return true
      }
      return false
    },
    import(entries, format) {
      const summary: HistoryImportSummary = { format, total: entries.length, added: 0, updated: 0, alreadyInHistory: 0 }
      for (const entry of entries) {
        const known = current(entry.videoId)
        if (!known) {
          table.put(entry.videoId, entry)
          summary.added++
        } else if (entry.watchedAt > known.watchedAt) {
          table.put(entry.videoId, { ...entry, channelAvatar: known.channelAvatar || entry.channelAvatar || '' })
          summary.updated++
        } else {
          summary.alreadyInHistory++
        }
      }
      return summary
    },
    markWatched(video) {
      const entry = current(video.videoId)
      if (entry) {
        if (entry.watched !== true) {
          table.put(video.videoId, { ...entry, watched: true })
        }
        return
      }
      table.put(video.videoId, {
        videoId: video.videoId,
        title: video.title,
        channelId: video.channelId,
        channelName: video.channelName,
        channelAvatar: video.channelAvatar ?? '',
        durationSeconds: video.durationSeconds,
        watchedAt: now(),
        positionSeconds: 0,
        watched: true
      })
    },
    markUnwatched(videoId) {
      const entry = current(videoId)
      if (entry && entry.watched !== false) {
        table.put(videoId, { ...entry, watched: false })
      }
    },
    remove(videoId) {
      if (current(videoId)) {
        table.remove(videoId)
      }
    },
    clear() {
      for (const { key } of table.list()) {
        table.remove(key)
      }
    }
  }
}
