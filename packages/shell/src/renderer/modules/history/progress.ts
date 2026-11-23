import { shallowRef, type ShallowRef } from 'vue'
import {
  entryWithPosition,
  watchedAction,
  watchProgress,
  type HistoryEntry,
  type HistoryVideo,
  type WatchProgress
} from '../../../shared/history'
import type { VideoMenuItem } from '../../components/videoMenu'

/** Saved history entries by video ID, shared by every card in this window and kept current. */
const entries = shallowRef(new Map<string, HistoryEntry>())
let started = false

async function reload(): Promise<void> {
  try {
    const list = await window.fraitube.listHistory()
    entries.value = new Map(list.map((entry) => [entry.videoId, entry]))
  } catch {
    // Cards show no progress until the next change loads the history again.
  }
}

function start(): void {
  if (!started) {
    started = true
    window.fraitube.onHistoryChanged(() => {
      void reload()
    })
    window.fraitube.onHistoryPositionSaved((videoId, positionSeconds) => {
      const entry = entryWithPosition(entries.value.get(videoId), positionSeconds)
      if (entry) {
        entries.value = new Map(entries.value).set(videoId, entry)
      }
    })
    void reload()
  }
}

/** The saved history entries by video ID, kept current as the history changes. */
export function useHistoryEntries(): ShallowRef<Map<string, HistoryEntry>> {
  start()
  return entries
}

/** The watch progress of any video, from the history; undefined while a video does not count as played. */
export function useWatchProgress(): { progressOf: (videoId: string) => WatchProgress | undefined } {
  start()
  return {
    progressOf(videoId) {
      const entry = entries.value.get(videoId)
      return entry ? watchProgress(entry) : undefined
    }
  }
}

/** The menu item that marks a video as watched, or once it is watched, as unwatched. */
export function useWatchedMenuItem(): { watchedItem: (video: HistoryVideo) => VideoMenuItem } {
  start()
  return {
    watchedItem(video) {
      // When saving fails, the video simply keeps its state.
      if (watchedAction(entries.value.get(video.videoId)) === 'markUnwatched') {
        return { label: 'Mark as unwatched', run: () => void window.fraitube.markUnwatched(video.videoId).catch(() => undefined) }
      }
      return { label: 'Mark as watched', run: () => void window.fraitube.markWatched(video).catch(() => undefined) }
    }
  }
}
