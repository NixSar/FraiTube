import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { channelFeedUrl, liveFeedUrl, mapWithLimit, mergeFeeds, parseRssFeed, shortsFeedUrl, videosFeedUrl } from '@fraitube/subscriptions'
import type { Channel, Feed, FeedVideo } from '@fraitube/subscriptions/types'
import type { FeedProgress } from '../shared/bridge'

/** Feeds fetched at the same time. */
export const FEED_CONCURRENCY = 4
/** How long a fetched feed is shown before new videos are fetched from YouTube again, unless the feed service is given another time. */
export const FEED_MAX_AGE_MS = 60 * 60_000
/** While channels are fetched, the channels fetched so far are sent at most this often. */
export const FEED_PROGRESS_INTERVAL_MS = 500

export type FetchText = (url: string) => Promise<{ status: number; text: string }>

export interface FeedService {
  /** The feed of the given channels, reused while fresh unless a refresh is asked for. */
  get(channels: readonly Channel[], refresh: boolean): Promise<Feed>
  /** Drops what was fetched for every channel not among the given ones, also from the saved feed. */
  keepOnly(channels: readonly Channel[]): void
}

/**
 * The fetched feed as kept between starts: when it was fetched, whether the channels' Shorts feeds were
 * fetched too, the channels whose Shorts feed is still to be fetched, and each channel's videos, null
 * for a channel that failed.
 */
export interface SavedFeed {
  fetchedAt: number
  shorts?: boolean
  shortsMissing?: string[]
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
    typeof video.viewsText === 'string' && typeof video.thumbnail === 'string' &&
    (video.live === undefined || typeof video.live === 'boolean') &&
    (video.short === undefined || typeof video.short === 'boolean')
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
      const shortsMissing = Array.isArray(data.shortsMissing) ? data.shortsMissing.filter((id): id is string => typeof id === 'string') : []
      return {
        fetchedAt: data.fetchedAt,
        ...(data.shorts === true ? { shorts: true } : {}),
        ...(data.shorts === true && shortsMissing.length > 0 ? { shortsMissing } : {}),
        channels: data.channels
      }
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
 * that is not too old yet is shown again after a restart. The saved feed holds subscribed channels
 * only. maxAgeMs gives how old a feed may be before it is fetched again, undefined for never.
 * While showShorts is true, each channel's Shorts feed is fetched too, a feed fetched without them is
 * fetched again, and so is a channel whose Shorts feed was not fetched or failed; while it is false, no
 * Shorts feed is fetched and every short is left out. A request that differs from the one running
 * waits for it to end.
 */
export function createFeedService(
  fetchText: FetchText,
  now: () => number = Date.now,
  onProgress?: (progress: FeedProgress) => void,
  cache?: FeedCache,
  maxAgeMs: () => number | undefined = () => FEED_MAX_AGE_MS,
  showShorts: () => boolean = () => false
): FeedService {
  /**
   * Each fetched channel's videos, undefined for a channel that failed, when they were fetched, whether
   * the Shorts feeds were fetched with them, and the channels whose Shorts feed is still to be fetched.
   */
  let cached: { fetchedAt: number; shorts: boolean; shortsMissing: Set<string>; channels: Map<string, FeedVideo[] | undefined> } | undefined
  let cacheRead = false
  let loading: { key: string; feed: Promise<Feed> } | undefined

  function readCache(): void {
    if (cacheRead) return
    cacheRead = true
    const saved = cache?.load()
    if (saved) {
      cached = {
        fetchedAt: saved.fetchedAt,
        shorts: saved.shorts === true,
        shortsMissing: new Set(saved.shortsMissing ?? []),
        channels: new Map(saved.channels.map(([id, videos]) => [id, videos ?? undefined]))
      }
    }
  }

  function saveCache(fetched: NonNullable<typeof cached>): void {
    cache?.save({
      fetchedAt: fetched.fetchedAt,
      ...(fetched.shorts ? { shorts: true } : {}),
      ...(fetched.shorts && fetched.shortsMissing.size > 0 ? { shortsMissing: [...fetched.shortsMissing] } : {}),
      channels: [...fetched.channels].map(([id, videos]) => [id, videos ?? null])
    })
  }

  /** Drops what was fetched for channels not among the given ones. True when something was dropped. */
  function dropOthers(channels: readonly Channel[]): boolean {
    readCache()
    if (!cached) {
      return false
    }
    const subscribed = new Set(channels.map((channel) => channel.id))
    let dropped = false
    for (const id of [...cached.channels.keys()]) {
      if (!subscribed.has(id)) {
        cached.channels.delete(id)
        cached.shortsMissing.delete(id)
        dropped = true
      }
    }
    return dropped
  }

  /** A feed's videos, with the channel filled in where the feed leaves it out. */
  function readFeed(text: string, channel: Channel): FeedVideo[] {
    return parseRssFeed(text).map((video) => ({
      ...video,
      channelId: video.channelId || channel.id,
      channelName: video.channelName || channel.name
    }))
  }

  /** One channel's videos, or undefined when its videos feed could not be loaded. */
  async function loadVideos(channel: Channel): Promise<FeedVideo[] | undefined> {
    try {
      let response = await fetchText(videosFeedUrl(channel.id))
      // Channels without a videos tab have no videos feed; their full feed still works.
      if (response.status === 404) {
        response = await fetchText(channelFeedUrl(channel.id))
      }
      return response.status === 200 ? readFeed(response.text, channel) : undefined
    } catch {
      return undefined
    }
  }

  /** One channel's live streams; a channel without live streams has no live feed and gives none. */
  async function loadLiveStreams(channel: Channel): Promise<FeedVideo[]> {
    try {
      const response = await fetchText(liveFeedUrl(channel.id))
      return response.status === 200 ? readFeed(response.text, channel).map((video) => ({ ...video, live: true })) : []
    } catch {
      return []
    }
  }

  /**
   * One channel's shorts, or undefined when its Shorts feed could not be loaded. A channel without
   * shorts has no Shorts feed and gives none.
   */
  async function loadShorts(channel: Channel): Promise<FeedVideo[] | undefined> {
    try {
      const response = await fetchText(shortsFeedUrl(channel.id))
      if (response.status === 200) {
        return readFeed(response.text, channel).map((video) => ({ ...video, short: true }))
      }
      return response.status === 404 ? [] : undefined
    } catch {
      return undefined
    }
  }

  /**
   * One channel's videos and live streams, and its shorts when asked for, newest first; the videos are
   * undefined when its videos feed could not be loaded. A live stream or short that the full feed also
   * has keeps its mark. shortsLoaded tells whether the Shorts feed was asked for and loaded.
   */
  async function loadChannel(channel: Channel, withShorts: boolean): Promise<{ videos: FeedVideo[] | undefined; shortsLoaded: boolean }> {
    const [videos, liveStreams, shorts] = await Promise.all([
      loadVideos(channel),
      loadLiveStreams(channel),
      withShorts ? loadShorts(channel) : Promise.resolve(undefined)
    ])
    return { videos: videos && mergeFeeds([liveStreams, shorts ?? [], videos]), shortsLoaded: shorts !== undefined }
  }

  /**
   * The feed of the given channels from what was fetched. A channel not fetched yet is not a failed one.
   * While shorts do not show, every short is left out.
   */
  function build(channels: readonly Channel[], fetched: NonNullable<typeof cached>): Feed {
    const results = channels.map((channel) => fetched.channels.get(channel.id))
    const videos = mergeFeeds(results.filter((list): list is FeedVideo[] => list !== undefined))
    return {
      videos: showShorts() ? videos : videos.filter((video) => !video.short),
      failedChannels: channels.filter((channel, index) => results[index] === undefined && fetched.channels.has(channel.id)),
      updatedAt: fetched.fetchedAt
    }
  }

  /**
   * Fetches the channels into the target, with their Shorts feeds when asked for, sending the channels
   * fetched so far along the way. In a feed with shorts, a channel whose videos came without its Shorts
   * feed is noted as still missing it.
   */
  async function fetchInto(target: NonNullable<typeof cached>, toFetch: readonly Channel[], withShorts: boolean): Promise<void> {
    const fetchedIds: string[] = []
    let reportedAt: number | undefined
    await mapWithLimit(toFetch, FEED_CONCURRENCY, async (channel) => {
      const { videos, shortsLoaded } = await loadChannel(channel, withShorts)
      target.channels.set(channel.id, videos)
      if (target.shorts && videos && !shortsLoaded) {
        target.shortsMissing.add(channel.id)
      } else {
        target.shortsMissing.delete(channel.id)
      }
      fetchedIds.push(channel.id)
      const time = now()
      if (onProgress && fetchedIds.length < toFetch.length && (reportedAt === undefined || time - reportedAt >= FEED_PROGRESS_INTERVAL_MS)) {
        reportedAt = time
        onProgress({ fetchedChannelIds: [...fetchedIds], fetched: fetchedIds.length, total: toFetch.length })
      }
    })
  }

  /**
   * Fetches every channel when asked to, when nothing was fetched yet, when the last fetch is older
   * than maxAgeMs, or when shorts show and the last fetch was without them; otherwise only channels
   * never fetched, such as a new subscription, and, while shorts show, channels still missing their
   * Shorts feed. A removed subscription needs no fetch, and what was fetched for it is dropped, also
   * from the saved feed.
   */
  async function load(channels: readonly Channel[], refresh: boolean): Promise<Feed> {
    const dropped = dropOthers(channels)
    const withShorts = showShorts()
    // A fetch time ahead of the clock, as after the clock was turned back, counts as old.
    const age = cached ? now() - cached.fetchedAt : -1
    const maxAge = maxAgeMs()
    if (refresh || !cached || age < 0 || (maxAge !== undefined && age >= maxAge) || (withShorts && !cached.shorts)) {
      const next = { fetchedAt: now(), shorts: withShorts, shortsMissing: new Set<string>(), channels: new Map<string, FeedVideo[] | undefined>() }
      await fetchInto(next, channels, withShorts)
      cached = next
      saveCache(next)
      return build(channels, next)
    }
    const known = cached
    const missing = channels.filter((channel) => !known.channels.has(channel.id) || (withShorts && known.shortsMissing.has(channel.id)))
    if (missing.length > 0) {
      await fetchInto(known, missing, withShorts)
    }
    if (missing.length > 0 || dropped) {
      saveCache(known)
    }
    return build(channels, known)
  }

  return {
    keepOnly(channels) {
      if (dropOthers(channels) && cached) {
        saveCache(cached)
      }
    },
    get(channels, refresh) {
      const key = `${refresh ? 'refresh:' : ''}${showShorts() ? 'shorts:' : ''}${channels.map((channel) => channel.id).sort().join(',')}`
      if (loading?.key === key) {
        return loading.feed
      }
      // A request that differs from the one running waits for it, so two fetches never run side by side.
      const running = loading?.feed
      const feed = running ? running.then(() => undefined, () => undefined).then(() => load(channels, refresh)) : load(channels, refresh)
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
