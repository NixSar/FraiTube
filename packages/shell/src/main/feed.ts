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

/**
 * While channels are fetched, onProgress gets the channels fetched so far: right after the first
 * channel, then at most every FEED_PROGRESS_INTERVAL_MS. Videos come only with the finished feed.
 */
export function createFeedService(
  fetchText: FetchText,
  now: () => number = Date.now,
  onProgress?: (progress: FeedProgress) => void
): FeedService {
  /** Each fetched channel's videos, undefined for a channel that failed, and when they were fetched. */
  let cached: { fetchedAt: number; channels: Map<string, FeedVideo[] | undefined> } | undefined
  let loading: { key: string; feed: Promise<Feed> } | undefined

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
    const fresh = cached !== undefined && now() - cached.fetchedAt < FEED_MAX_AGE_MS
    if (refresh || !cached || !fresh) {
      const next = { fetchedAt: now(), channels: new Map<string, FeedVideo[] | undefined>() }
      await fetchInto(next, channels)
      cached = next
      return build(channels, next)
    }
    const known = cached
    await fetchInto(known, channels.filter((channel) => !known.channels.has(channel.id)))
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
