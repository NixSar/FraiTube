import { isChannelId } from '@fraitube/subscriptions'
import type { FeedVideo } from '@fraitube/subscriptions/types'
import { isPlayed, isWatched, watchProgress, type HistoryEntry } from '../../../shared/history'

export type FeedType = 'all' | 'videos' | 'live'
export type FeedWatched = 'all' | 'unwatched' | 'progress'
export type FeedDate = 'any' | 'today' | 'week' | 'month'

/** What New videos shows: every filter combines with the others. */
export interface FeedFilters {
  type: FeedType
  watched: FeedWatched
  date: FeedDate
  /** A channel ID, or empty for every channel. */
  channel: string
  /** Text the titles must contain, or empty. */
  title: string
}

export const DEFAULT_FEED_FILTERS: FeedFilters = { type: 'all', watched: 'all', date: 'any', channel: '', title: '' }

export const FEED_TYPES: { value: FeedType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'videos', label: 'Videos' },
  { value: 'live', label: 'Live' }
]

export const FEED_WATCHED: { value: FeedWatched; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unwatched', label: 'Unwatched' },
  { value: 'progress', label: 'In progress' }
]

export const FEED_DATES: { value: FeedDate; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' }
]

/** Longest title filter text. */
export const MAX_TITLE_FILTER_LENGTH = 100

const DAY_MS = 24 * 60 * 60_000

function choice<T extends string>(options: readonly { value: T }[], value: unknown, fallback: T): T {
  return options.find((option) => option.value === value)?.value ?? fallback
}

/** The filters in a page address; a missing or unknown value is the default one. */
export function readFeedFilters(query: Record<string, unknown>): FeedFilters {
  const channel = query['channel']
  const title = query['title']
  return {
    type: choice(FEED_TYPES, query['type'], 'all'),
    watched: choice(FEED_WATCHED, query['watched'], 'all'),
    date: choice(FEED_DATES, query['date'], 'any'),
    channel: isChannelId(channel) ? channel : '',
    title: typeof title === 'string' ? title.slice(0, MAX_TITLE_FILTER_LENGTH) : ''
  }
}

/** The page address part for the filters, leaving out every default one. */
export function feedFiltersQuery(filters: FeedFilters): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.type !== 'all') query['type'] = filters.type
  if (filters.watched !== 'all') query['watched'] = filters.watched
  if (filters.date !== 'any') query['date'] = filters.date
  if (filters.channel) query['channel'] = filters.channel
  if (filters.title) query['title'] = filters.title
  return query
}

/** Whether any filter narrows the list. A title of only spaces narrows nothing. */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return filters.type !== 'all' || filters.watched !== 'all' || filters.date !== 'any' || filters.channel !== '' ||
    filters.title.trim() !== ''
}

/** The earliest publish time the date filter lets through: today counts from midnight here, a week and a month as 7 and 30 days. */
export function earliestPublished(date: FeedDate, now: number): number | undefined {
  if (date === 'today') {
    return new Date(now).setHours(0, 0, 0, 0)
  }
  if (date === 'week') {
    return now - 7 * DAY_MS
  }
  if (date === 'month') {
    return now - 30 * DAY_MS
  }
  return undefined
}

function textKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The feed videos the filters let through, in their order. Unwatched are the videos not played and not
 * marked watched, the ones shown unfaded; in progress are the played ones not watched yet. A scheduled
 * live stream, published in the future, passes every date filter.
 */
export function filterFeed(
  videos: readonly FeedVideo[],
  filters: FeedFilters,
  entryOf: (videoId: string) => HistoryEntry | undefined,
  now: number
): FeedVideo[] {
  const earliest = earliestPublished(filters.date, now)
  const title = textKey(filters.title)
  return videos.filter((video) => {
    if ((filters.type === 'live' && !video.live) || (filters.type === 'videos' && video.live)) {
      return false
    }
    if (filters.channel && video.channelId !== filters.channel) {
      return false
    }
    if (earliest !== undefined && video.publishedAt < earliest) {
      return false
    }
    if (title && !textKey(video.title).includes(title)) {
      return false
    }
    if (filters.watched !== 'all') {
      const entry = entryOf(video.id)
      if (filters.watched === 'unwatched') {
        return !entry || watchProgress(entry) === undefined
      }
      return entry !== undefined && !isWatched(entry) && isPlayed(entry)
    }
    return true
  })
}

/** The channels that have videos in the feed, by name, for choosing one. */
export function feedChannels(videos: readonly FeedVideo[]): { id: string; name: string }[] {
  const byId = new Map<string, string>()
  for (const video of videos) {
    if (!byId.has(video.channelId)) {
      byId.set(video.channelId, video.channelName || video.channelId)
    }
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}
