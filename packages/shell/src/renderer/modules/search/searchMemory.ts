import { ref } from 'vue'
import { SEARCH_EXPIRED_MESSAGE, type ChannelResult, type SearchFilter, type VideoResult } from '@fraitube/youtube/types'

/** How many searches keep their results while the app runs, as many as the main process keeps next pages for. */
export const KEPT_SEARCHES = 50

/** What a search has shown so far, and the token for its next page. */
export interface KeptSearch {
  videos: VideoResult[]
  channels: ChannelResult[]
  shorts: VideoResult[]
  continuation?: string
}

/** Adds a page of results to a search: each video, short and channel once, and the page's token for the next one. */
export function addPage(search: KeptSearch, page: KeptSearch): void {
  const seenVideos = new Set([...search.videos, ...search.shorts].map((video) => video.id))
  const seenChannels = new Set(search.channels.map((channel) => channel.id))
  search.videos.push(...page.videos.filter((video) => !seenVideos.has(video.id)))
  search.shorts.push(...page.shorts.filter((video) => !seenVideos.has(video.id)))
  search.channels.push(...page.channels.filter((channel) => !seenChannels.has(channel.id)))
  if (page.continuation) {
    search.continuation = page.continuation
  } else {
    delete search.continuation
  }
}

/** True for the error of a next page the main process no longer keeps. Its search then runs again from its first page. */
export function isExpiredSearch(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes(SEARCH_EXPIRED_MESSAGE)
}

export interface SearchMemory {
  /** The kept results of a search made with shorts shown or not, or undefined when it was not kept. */
  get(query: string, filter: SearchFilter, showShorts?: boolean): KeptSearch | undefined
  /** Keeps what a search shows now, in place of what was kept for it with the same Show Shorts setting. */
  keep(query: string, filter: SearchFilter, search: KeptSearch, showShorts?: boolean): void
  /**
   * Adds a next page that arrived while its search was not shown, when the search is still kept with the
   * token the page was asked with.
   */
  addLatePage(query: string, filter: SearchFilter, token: string, page: KeptSearch, showShorts?: boolean): void
  /** Forgets what was kept for one search. */
  drop(query: string, filter: SearchFilter, showShorts?: boolean): void
  /** Forgets what was kept for a search text, with every filter and both Show Shorts settings. */
  forget(query: string): void
}

/**
 * Keeps the results of the last searches, so going back to one or changing its filter shows it at once.
 * A search is kept apart for each Show Shorts setting, until its text is searched from the search box.
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
    },
    addLatePage(query, filter, token, page, showShorts) {
      const search = kept.get(keyOf(query, filter, showShorts))
      if (search?.continuation === token) {
        addPage(search, page)
      }
    },
    drop(query, filter, showShorts) {
      kept.delete(keyOf(query, filter, showShorts))
    },
    forget(query) {
      for (const key of [...kept.keys()]) {
        // A key is the Show Shorts setting, the filter and the text, each on its own line.
        if (key.split('\n').slice(2).join('\n') === query) {
          kept.delete(key)
        }
      }
    }
  }
}

/** The searches of this window. */
export const searchMemory = createSearchMemory()

/** Counts the searches run from the search box while their results already show, which the search page then runs again. */
export const searchRuns = ref(0)
