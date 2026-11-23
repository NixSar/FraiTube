import { shallowRef, type ShallowRef } from 'vue'
import { entryWithPosition, watchProgress, type HistoryEntry, type WatchProgress } from '../../../shared/history'

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
