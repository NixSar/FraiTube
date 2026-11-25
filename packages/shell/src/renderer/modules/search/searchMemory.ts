import type { ChannelResult, SearchFilter, VideoResult } from '@fraitube/youtube/types'

/** How many searches keep their results while the app runs, as many as the main process keeps next pages for. */
export const KEPT_SEARCHES = 50

/** What a search has shown so far, and the token for its next page. */
export interface KeptSearch {
  videos: VideoResult[]
  channels: ChannelResult[]
  shorts: VideoResult[]
  continuation?: string
}

export interface SearchMemory {
  /** The kept results of a search made with shorts shown or not, or undefined when it was not kept. */
  get(query: string, filter: SearchFilter, showShorts?: boolean): KeptSearch | undefined
  /** Keeps what a search shows now, in place of what was kept for it with the same Show Shorts setting. */
  keep(query: string, filter: SearchFilter, search: KeptSearch, showShorts?: boolean): void
}

/**
 * Keeps the results of the last searches, so going back to one or running it again shows it at once.
 * A search is kept apart for each Show Shorts setting.
 */
export function createSearchMemory(limit = KEPT_SEARCHES): SearchMemory {
  const kept = new Map<string, KeptSearch>()
  const keyOf = (query: string, filter: SearchFilter, showShorts = false): string => `${showShorts ? 'shorts' : 'no-shorts'}\n${filter}\n${query}`
  const copyOf = (search: KeptSearch): KeptSearch => ({
    videos: [...search.videos],
    channels: [...search.channels],
    shorts: [...search.shorts],
    ...(search.continuation ? { continuation: search.continuation } : {})
  })

  return {
    get(query, filter, showShorts) {
      const key = keyOf(query, filter, showShorts)
      const search = kept.get(key)
      if (!search) return undefined
      // The search used last is the one dropped last.
      kept.delete(key)
      kept.set(key, search)
      return copyOf(search)
    },
    keep(query, filter, search, showShorts) {
      const key = keyOf(query, filter, showShorts)
      kept.delete(key)
      kept.set(key, copyOf(search))
      for (const oldest of kept.keys()) {
        if (kept.size <= limit) break
        kept.delete(oldest)
      }
    }
  }
}

/** The searches of this window. */
export const searchMemory = createSearchMemory()
