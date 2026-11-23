import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { channelFeedUrl, mapWithLimit, mergeFeeds, parseRssFeed, videosFeedUrl } from '@fraitube/subscriptions'
import type { Channel, Feed, FeedVideo } from '@fraitube/subscriptions/types'
import type { FeedProgress } from '../shared/bridge'

/** Feeds fetched at the same time. */
export const FEED_CONCURRENCY = 4
/** How long a fetched feed is shown before new videos are fetched from YouTube again. */
export const FEED_MAX_AGE_MS = 60 * 60_000
/** While channels are fetched, the channels fetched so far are sent at most this often. */
export const FEED_PROGRESS_INTERVAL_MS = 500

export type FetchText = (url: string) => Promise<{ status: number; text: string }>

export interface FeedService {
  /** The feed of the given channels, reused while fresh unless a refresh is asked for. */
  get(channels: readonly Channel[], refresh: boolean): Promise<Feed>
}

/** The fetched feed as kept between starts: when it was fetched, and each channel's videos, null for a channel that failed. */
export interface SavedFeed {
  fetchedAt: number
  channels: [string, FeedVideo[] | null][]
}

/** Where the fetched feed is kept between starts. */
export interface FeedCache {
  /** The saved feed, or undefined when there is none or it cannot be read. */
  load(): SavedFeed | undefined
  save(feed: SavedFeed): void
}

function isFeedVideo(value: unknown): value is FeedVideo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const video = value as Partial<FeedVideo>
  return typeof video.id === 'string' && typeof video.title === 'string' && typeof video.channelId === 'string' &&
    typeof video.channelName === 'string' && typeof video.publishedAt === 'number' &&
    typeof video.viewsText === 'string' && typeof video.thumbnail === 'string'
}

function isSavedChannel(value: unknown): value is [string, FeedVideo[] | null] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' &&
    (value[1] === null || (Array.isArray(value[1]) && value[1].every(isFeedVideo)))
}

/** Reads a saved feed, or undefined when the text is not one. */
export function readSavedFeed(text: string): SavedFeed | undefined {
  try {
    const data = JSON.parse(text) as Partial<SavedFeed> | null
    if (typeof data?.fetchedAt === 'number' && Array.isArray(data.channels) && data.channels.every(isSavedChannel)) {
      return { fetchedAt: data.fetchedAt, channels: data.channels }
    }
  } catch {
    // Not a saved feed.
  }
  return undefined
}

/**
 * Keeps the fetched feed in a file. It is read once when the app starts; each save replaces the file
 * whole, one after another, and a save that fails leaves the last one.
 */
export function createFeedCacheFile(file: string): FeedCache {
  let saving: Promise<void> = Promise.resolve()
  return {
    load() {
      try {
        return readSavedFeed(readFileSync(file, 'utf8'))
      } catch {
        return undefined
      }
    },
    save(feed) {
      const text = JSON.stringify(feed)
      saving = saving.then(async () => {
        const temporary = `${file}.tmp`
        await writeFile(temporary, text, 'utf8')
        await rename(temporary, file)
      }).catch(() => undefined)
    }
  }
}

/**
 * While channels are fetched, onProgress gets the channels fetched so far: right after the first
 * channel, then at most every FEED_PROGRESS_INTERVAL_MS. Videos come only with the finished feed.
 * The feed is saved in the cache after each fetch and read from it on the first request, so a feed
 * fetched under an hour ago is shown again after a restart.
 */
export function createFeedService(
  fetchText: FetchText,
  now: () => number = Date.now,
  onProgress?: (progress: FeedProgress) => void,
  cache?: FeedCache
): FeedService {
  /** Each fetched channel's videos, undefined for a channel that failed, and when they were fetched. */
  let cached: { fetchedAt: number; channels: Map<string, FeedVideo[] | undefined> } | undefined
  let cacheRead = false
  let loading: { key: string; feed: Promise<Feed> } | undefined

  function readCache(): void {
    if (cacheRead) return
    cacheRead = true
    const saved = cache?.load()
    if (saved) {
      cached = { fetchedAt: saved.fetchedAt, channels: new Map(saved.channels.map(([id, videos]) => [id, videos ?? undefined])) }
    }
  }

  function saveCache(fetched: NonNullable<typeof cached>): void {
    cache?.save({ fetchedAt: fetched.fetchedAt, channels: [...fetched.channels].map(([id, videos]) => [id, videos ?? null]) })
  }

  /** One channel's videos, or undefined when its feed could not be loaded. */
  async function loadChannel(channel: Channel): Promise<FeedVideo[] | undefined> {
    try {
      let response = await fetchText(videosFeedUrl(channel.id))
      // Channels without a videos tab have no videos feed; their full feed still works.
      if (response.status === 404) {
        response = await fetchText(channelFeedUrl(channel.id))
      }
      if (response.status !== 200) {
        return undefined
      }
      return parseRssFeed(response.text).map((video) => ({
        ...video,
        channelId: video.channelId || channel.id,
        channelName: video.channelName || channel.name
      }))
    } catch {
      return undefined
    }
  }

  /** The feed of the given channels from what was fetched. A channel not fetched yet is not a failed one. */
  function build(channels: readonly Channel[], fetched: NonNullable<typeof cached>): Feed {
    const results = channels.map((channel) => fetched.channels.get(channel.id))
    return {
      videos: mergeFeeds(results.filter((videos): videos is FeedVideo[] => videos !== undefined)),
      failedChannels: channels.filter((channel, index) => results[index] === undefined && fetched.channels.has(channel.id)),
      updatedAt: fetched.fetchedAt
    }
  }

  /** Fetches the channels into the target, sending the channels fetched so far along the way. */
  async function fetchInto(target: NonNullable<typeof cached>, toFetch: readonly Channel[]): Promise<void> {
    const fetchedIds: string[] = []
    let reportedAt: number | undefined
    await mapWithLimit(toFetch, FEED_CONCURRENCY, async (channel) => {
      target.channels.set(channel.id, await loadChannel(channel))
      fetchedIds.push(channel.id)
      const time = now()
      if (onProgress && fetchedIds.length < toFetch.length && (reportedAt === undefined || time - reportedAt >= FEED_PROGRESS_INTERVAL_MS)) {
        reportedAt = time
        onProgress({ fetchedChannelIds: [...fetchedIds], fetched: fetchedIds.length, total: toFetch.length })
      }
    })
  }

  /**
   * Fetches every channel when asked to or when the last fetch is an hour old; otherwise only
   * channels never fetched, such as a new subscription. A removed subscription needs no fetch.
   */
  async function load(channels: readonly Channel[], refresh: boolean): Promise<Feed> {
    readCache()
    // A fetch time ahead of the clock, as after the clock was turned back, counts as old.
    const age = cached ? now() - cached.fetchedAt : -1
    if (refresh || !cached || age < 0 || age >= FEED_MAX_AGE_MS) {
      const next = { fetchedAt: now(), channels: new Map<string, FeedVideo[] | undefined>() }
      await fetchInto(next, channels)
      cached = next
      saveCache(next)
      return build(channels, next)
    }
    const known = cached
    const missing = channels.filter((channel) => !known.channels.has(channel.id))
    if (missing.length > 0) {
      await fetchInto(known, missing)
      saveCache(known)
    }
    return build(channels, known)
  }

  return {
    get(channels, refresh) {
      const key = `${refresh ? 'refresh:' : ''}${channels.map((channel) => channel.id).sort().join(',')}`
      if (loading?.key === key) {
        return loading.feed
      }
      const feed = load(channels, refresh)
      loading = { key, feed }
      // Happens as the load settles, so a later request never joins a finished load.
      const settle = (): void => {
        if (loading?.feed === feed) {
          loading = undefined
        }
      }
      feed.then(settle, settle)
      return feed
    }
  }
}
