import { describe, expect, it } from 'vitest'
import { createFeedService, FEED_MAX_AGE_MS, FEED_PROGRESS_INTERVAL_MS, type FetchText } from '../../packages/shell/src/main/feed'
import type { FeedProgress } from '../../packages/shell/src/shared/bridge'
import { channelFeedUrl, videosFeedUrl } from '../../packages/subscriptions/src/rss'
import { GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS, rssFeed } from '../subscriptions/fixtures'

const gamersNexus = { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' }
const hardwareUnboxed = { id: HARDWARE_UNBOXED, name: 'Hardware Unboxed', avatar: '' }
const level1 = { id: LEVEL1_TECHS, name: 'Level1Techs', avatar: '' }

function feedWithVideo(id: string, published: string): string {
  return `<feed><entry><yt:videoId>${id}</yt:videoId><title>${id}</title><published>${published}</published></entry></feed>`
}

describe('createFeedService', () => {
  it('merges channels, falls back to the full feed, and names channels that failed', async () => {
    const requested: string[] = []
    const fetchText: FetchText = async (url) => {
      requested.push(url)
      if (url === videosFeedUrl(GAMERS_NEXUS)) return { status: 200, text: rssFeed }
      if (url === videosFeedUrl(HARDWARE_UNBOXED)) return { status: 404, text: '' }
      if (url === channelFeedUrl(HARDWARE_UNBOXED)) return { status: 200, text: feedWithVideo('hwunboxed01', '2026-11-21T10:00:00Z') }
      return { status: 500, text: '' }
    }
    const feed = await createFeedService(fetchText, () => 1000).get([gamersNexus, hardwareUnboxed, level1], false)

    expect(feed.videos.map((video) => video.id)).toEqual(['l8qxFcaLSM4', 'hwunboxed01', 'KNVKzPHgg4M'])
    // The fallback feed's video has no channel data of its own, so the subscription fills it in.
    expect(feed.videos[1]).toMatchObject({ channelId: HARDWARE_UNBOXED, channelName: 'Hardware Unboxed' })
    expect(feed.failedChannels).toEqual([level1])
    expect(feed.updatedAt).toBe(1000)
    expect(requested).toContain(channelFeedUrl(HARDWARE_UNBOXED))
    expect(requested).not.toContain(channelFeedUrl(GAMERS_NEXUS))
  })

  it('treats a network error as a failed channel', async () => {
    const feed = await createFeedService(async () => {
      throw new Error('offline')
    }).get([gamersNexus], false)
    expect(feed.failedChannels).toEqual([gamersNexus])
    expect(feed.videos).toEqual([])
  })

  it('fetches at most once an hour unless refreshed', async () => {
    let time = 0
    let requests = 0
    const service = createFeedService(async () => {
      requests++
      return { status: 200, text: rssFeed }
    }, () => time)

    expect(FEED_MAX_AGE_MS).toBe(60 * 60_000)
    await service.get([gamersNexus], false)
    time = FEED_MAX_AGE_MS - 1
    await service.get([gamersNexus], false)
    expect(requests).toBe(1)

    await service.get([gamersNexus], true)
    expect(requests).toBe(2)

    time = 2 * FEED_MAX_AGE_MS
    await service.get([gamersNexus], false)
    expect(requests).toBe(3)
  })

  it('fetches only a new subscription, and nothing when one is removed', async () => {
    let time = 0
    const requested: string[] = []
    const service = createFeedService(async (url) => {
      requested.push(url)
      return { status: 200, text: url === videosFeedUrl(LEVEL1_TECHS) ? feedWithVideo('level1tech1', '2026-11-22T10:00:00Z') : rssFeed }
    }, () => time)

    const first = await service.get([gamersNexus], false)
    time = 1000
    const added = await service.get([gamersNexus, level1], false)
    expect(requested).toEqual([videosFeedUrl(GAMERS_NEXUS), videosFeedUrl(LEVEL1_TECHS)])
    expect(added.videos.map((video) => video.id)).toContain('level1tech1')
    expect(added.updatedAt).toBe(first.updatedAt)

    const removed = await service.get([level1], false)
    expect(requested).toHaveLength(2)
    expect(removed.videos.map((video) => video.id)).toEqual(['level1tech1'])
  })

  it('sends the channels fetched so far after the first channel, then at most every half second', async () => {
    let time = 0
    const progress: FeedProgress[] = []
    const service = createFeedService(async (url) => {
      time += 200
      return { status: 200, text: url === videosFeedUrl(LEVEL1_TECHS) ? feedWithVideo('level1tech1', '2026-11-22T10:00:00Z') : rssFeed }
    }, () => time, (update) => progress.push(update))

    expect(FEED_PROGRESS_INTERVAL_MS).toBe(500)
    const feed = await service.get([gamersNexus, hardwareUnboxed, level1, { ...level1, id: 'UC0000000000000000000000' }], false)

    // Four channels, four at a time: sent after the first, not after the next two within half a second, never after the last.
    expect(progress).toEqual([{ fetchedChannelIds: [GAMERS_NEXUS], fetched: 1, total: 4 }])
    expect(feed.videos.map((video) => video.id)).toContain('level1tech1')
  })

  it('names every channel fetched so far, and sends videos only with the finished feed', async () => {
    // Every look at the clock is a second later, so no update is held back.
    let time = 0
    const progress: FeedProgress[] = []
    const service = createFeedService(async (url) => {
      return { status: 200, text: url === videosFeedUrl(LEVEL1_TECHS) ? feedWithVideo('level1tech1', '2026-11-22T10:00:00Z') : rssFeed }
    }, () => (time += 1000), (update) => progress.push(update))

    const feed = await service.get([gamersNexus, hardwareUnboxed, level1, { ...level1, id: 'UC0000000000000000000000' }, { ...level1, id: 'UC1111111111111111111111' }], false)

    // Five channels: each one fetched is named as it is done, and nothing is sent after the last.
    expect(progress.map((update) => update.fetchedChannelIds)).toEqual([
      [GAMERS_NEXUS],
      [GAMERS_NEXUS, HARDWARE_UNBOXED],
      [GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS],
      [GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS, 'UC0000000000000000000000']
    ])
    expect(progress.every((update) => !('feed' in update))).toBe(true)
    expect(feed.videos.map((video) => video.id)).toContain('level1tech1')
  })

  it('shares one load between requests made while it runs', async () => {
    let requests = 0
    const service = createFeedService(async () => {
      requests++
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { status: 200, text: rssFeed }
    })
    await Promise.all([service.get([gamersNexus], false), service.get([gamersNexus], false)])
    expect(requests).toBe(1)
  })
})
