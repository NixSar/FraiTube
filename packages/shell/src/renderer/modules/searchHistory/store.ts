import { shallowRef, type ShallowRef } from 'vue'
import type { PastSearch } from '../../../shared/searchHistory'

/** The past searches, newest first, shared by every part of this window and kept current. */
const searches = shallowRef<PastSearch[]>([])
let started = false

async function reload(): Promise<void> {
  try {
    searches.value = await window.fraitube.listSearchHistory()
  } catch {
    // The list stays as it was until the next change loads it again.
  }
}

function start(): void {
  if (!started) {
    started = true
    window.fraitube.onSearchHistoryChanged(() => {
      void reload()
    })
    void reload()
  }
}

/** The past searches, newest first, kept current as they change in any window. */
export function usePastSearches(): ShallowRef<PastSearch[]> {
  start()
  return searches
}
