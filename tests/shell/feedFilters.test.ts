import { describe, expect, it } from 'vitest'
import type { FeedVideo } from '../../packages/subscriptions/src/types'
import type { HistoryEntry } from '../../packages/shell/src/shared/history'
import {
  DEFAULT_FEED_FILTERS,
  earliestPublished,
  feedChannels,
  feedFiltersQuery,
  filterFeed,
  hasActiveFilters,
  readFeedFilters,
  type FeedFilters
} from '../../packages/shell/src/renderer/modules/subscriptions/feedFilters'
import { GAMERS_NEXUS, HARDWARE_UNBOXED } from '../subscriptions/fixtures'

const DAY = 24 * 60 * 60_000
const NOW = new Date(2026, 10, 24, 15, 0).getTime()

function video(id: string, change: Partial<FeedVideo> = {}): FeedVideo {
  return { id, title: id, channelId: GAMERS_NEXUS, channelName: 'Gamers Nexus', publishedAt: NOW - DAY / 24, viewsText: '', thumbnail: '', ...change }
}

function entry(videoId: string, positionSeconds: number, change: Partial<HistoryEntry> = {}): HistoryEntry {
  return { videoId, title: videoId, channelId: '', channelName: '', durationSeconds: 1000, watchedAt: 1, positionSeconds, ...change }
}

const videos = [
  video('newvideo001', { title: 'HW News: RAM prices' }),
  video('livestrm001', { title: 'Live Q&A', live: true }),
  video('scheduled01', { title: 'Upcoming stream', live: true, publishedAt: NOW + DAY }),
  video('hwunbox0001', { title: 'GPU review', channelId: HARDWARE_UNBOXED, channelName: 'Hardware Unboxed', publishedAt: NOW - 3 * DAY }),
  video('oldvideo001', { title: 'Old ram test', publishedAt: NOW - 20 * DAY }),
  video('ancient0001', { title: 'Ancient', publishedAt: NOW - 60 * DAY })
]

const history = new Map([
  ['newvideo001', entry('newvideo001', 500)],
  ['oldvideo001', entry('oldvideo001', 0, { watched: true })],
  ['hwunbox0001', entry('hwunbox0001', 5)]
])

function ids(change: Partial<FeedFilters>): string[] {
  return filterFeed(videos, { ...DEFAULT_FEED_FILTERS, ...change }, (videoId) => history.get(videoId), NOW).map((found) => found.id)
}

describe('filterFeed', () => {
  it('lets every video through with no filter, in order', () => {
    expect(ids({})).toEqual(videos.map((found) => found.id))
  })

  it('shows only videos or only live streams', () => {
    expect(ids({ type: 'live' })).toEqual(['livestrm001', 'scheduled01'])
    expect(ids({ type: 'videos' })).toEqual(['newvideo001', 'hwunbox0001', 'oldvideo001', 'ancient0001'])
  })

  it('shows the unwatched videos, or the ones in progress', () => {
    // A video played less than 1% counts as unwatched, as its card shows.
    expect(ids({ watched: 'unwatched' })).toEqual(['livestrm001', 'scheduled01', 'hwunbox0001', 'ancient0001'])
    expect(ids({ watched: 'progress' })).toEqual(['newvideo001'])
  })

  it('shows videos from today, this week or this month, and scheduled streams with each', () => {
    expect(ids({ date: 'today' })).toEqual(['newvideo001', 'livestrm001', 'scheduled01'])
    expect(ids({ date: 'week' })).toEqual(['newvideo001', 'livestrm001', 'scheduled01', 'hwunbox0001'])
    expect(ids({ date: 'month' })).toEqual(['newvideo001', 'livestrm001', 'scheduled01', 'hwunbox0001', 'oldvideo001'])
  })

  it('shows one channel', () => {
    expect(ids({ channel: HARDWARE_UNBOXED })).toEqual(['hwunbox0001'])
  })

  it('matches titles regardless of capitals and spaces', () => {
    expect(ids({ title: '  RAM ' })).toEqual(['newvideo001', 'oldvideo001'])
    expect(ids({ title: 'hw   news' })).toEqual(['newvideo001'])
    expect(ids({ title: '   ' })).toEqual(videos.map((found) => found.id))
  })

  it('combines the filters', () => {
    expect(ids({ type: 'videos', watched: 'unwatched', date: 'week' })).toEqual(['hwunbox0001'])
    expect(ids({ title: 'ram', watched: 'unwatched' })).toEqual([])
  })
})

describe('earliestPublished', () => {
  it('counts today from midnight here, and a week and a month as 7 and 30 days', () => {
    expect(earliestPublished('today', NOW)).toBe(new Date(2026, 10, 24).getTime())
    expect(earliestPublished('week', NOW)).toBe(NOW - 7 * DAY)
    expect(earliestPublished('month', NOW)).toBe(NOW - 30 * DAY)
    expect(earliestPublished('any', NOW)).toBeUndefined()
  })
})

describe('readFeedFilters and feedFiltersQuery', () => {
  it('reads the filters from the page address and writes only the ones that are not the default', () => {
    const filters: FeedFilters = { type: 'live', watched: 'progress', date: 'week', channel: GAMERS_NEXUS, title: 'news' }
    const query = feedFiltersQuery(filters)
    expect(query).toEqual({ type: 'live', watched: 'progress', date: 'week', channel: GAMERS_NEXUS, title: 'news' })
    expect(readFeedFilters(query)).toEqual(filters)
    expect(feedFiltersQuery(DEFAULT_FEED_FILTERS)).toEqual({})
  })

  it('reads a missing or unknown value as the default one', () => {
    expect(readFeedFilters({})).toEqual(DEFAULT_FEED_FILTERS)
    expect(readFeedFilters({ type: 'shorts', watched: ['all'], date: 'year', channel: 'not a channel', title: 5 })).toEqual(DEFAULT_FEED_FILTERS)
  })

  it('keeps at most 100 characters of the title', () => {
    expect(readFeedFilters({ title: 'a'.repeat(150) }).title).toHaveLength(100)
  })
})

describe('hasActiveFilters', () => {
  it('is true once any filter narrows the list', () => {
    expect(hasActiveFilters(DEFAULT_FEED_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FEED_FILTERS, title: '  ' })).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FEED_FILTERS, date: 'today' })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FEED_FILTERS, channel: GAMERS_NEXUS })).toBe(true)
  })
})

describe('feedChannels', () => {
  it('lists each channel with videos once, by name', () => {
    expect(feedChannels(videos)).toEqual([
      { id: GAMERS_NEXUS, name: 'Gamers Nexus' },
      { id: HARDWARE_UNBOXED, name: 'Hardware Unboxed' }
    ])
  })
})
