import type { Channel } from '@fraitube/subscriptions/types'

/** A subscribed channel on the loading screen, lit once its videos have arrived. */
export interface LoadingChannel extends Channel {
  done: boolean
}

/** What the loading screen shows while the feed is fetched. */
export interface FeedLoadingView {
  /** How full the progress bar is, from 0 to 100. */
  percent: number
  text: string
  channels: LoadingChannel[]
}

/** The progress bar, its text and the channel icons, from the channels fetched so far. */
export function feedLoadingView(
  channels: readonly Channel[],
  progress: { fetchedChannelIds: readonly string[]; fetched: number; total: number } | undefined
): FeedLoadingView {
  const fetched = progress?.fetched ?? 0
  const total = progress?.total ?? channels.length
  const done = new Set(progress?.fetchedChannelIds)
  return {
    percent: total > 0 ? Math.min(100, (fetched / total) * 100) : 0,
    text: total > 0 ? `Fetching ${fetched} of ${total} ${total === 1 ? 'channel' : 'channels'}` : 'Fetching new videos',
    channels: channels.map((channel) => ({ id: channel.id, name: channel.name, avatar: channel.avatar, done: done.has(channel.id) }))
  }
}
