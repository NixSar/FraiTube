import { describe, expect, it } from 'vitest'
import { mapWithLimit, mergeFeeds, timeAgo } from '../../packages/subscriptions/src/feed'
import type { FeedVideo } from '../../packages/subscriptions/src/types'

function video(id: string, publishedAt: number): FeedVideo {
  return { id, title: id, channelId: 'c', channelName: 'c', publishedAt, viewsText: '', thumbnail: '' }
}

describe('mergeFeeds', () => {
  it('lists every video once, newest first', () => {
    const merged = mergeFeeds([[video('a', 1), video('b', 3)], [video('c', 2), video('a', 1)]])
    expect(merged.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('mapWithLimit', () => {
  it('never runs more tasks at once than the limit and keeps the order', async () => {
    let running = 0
    let most = 0
    const results = await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5 * (8 - n)))
      running--
      return n * 10
    })
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(most).toBe(3)
  })

  it('handles an empty list', async () => {
    expect(await mapWithLimit([], 4, async () => 1)).toEqual([])
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')

  it('names the largest whole unit', () => {
    expect(timeAgo(now - 30_000, now)).toBe('just now')
    expect(timeAgo(now - 60_000, now)).toBe('1 minute ago')
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 hours ago')
    expect(timeAgo(now - 8 * 24 * 3600_000, now)).toBe('1 week ago')
    expect(timeAgo(now - 400 * 24 * 3600_000, now)).toBe('1 year ago')
  })

  it('treats a future time as now', () => {
    expect(timeAgo(now + 60_000, now)).toBe('just now')
  })
})
