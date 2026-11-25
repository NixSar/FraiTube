import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createFeedCacheFile,
  createFeedService,
  FEED_MAX_AGE_MS,
  FEED_PROGRESS_INTERVAL_MS,
  readSavedFeed,
  type FeedCache,
  type FetchText,
  type SavedFeed
} from '../../packages/shell/src/main/feed'
import { TEST_DATA_DIR } from '../paths'
import type { FeedProgress } from '../../packages/shell/src/shared/bridge'
import { channelFeedUrl, liveFeedUrl, shortsFeedUrl, videosFeedUrl } from '../../packages/subscriptions/src/rss'
import { GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS, rssFeed } from '../subscriptions/fixtures'

const gamersNexus = { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' }
const hardwareUnboxed = { id: HARDWARE_UNBOXED, name: 'Hardware Unboxed', avatar: '' }
const level1 = { id: LEVEL1_TECHS, name: 'Level1Techs', avatar: '' }

function feedWithVideo(id: string, published: string): string {
  return `<feed><entry><yt:videoId>${id}</yt:videoId><title>${id}</title><published>${published}</published></entry></feed>`
}

/** True for a channel's live-streams feed, which every channel load also asks for. */
function isLiveFeed(url: string): boolean {
  return url.includes('playlist_id=UULV')
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

  it('adds each channel\'s live streams with their live mark, newest first, listing each video once', async () => {
    const live = `<feed>
      <entry><yt:videoId>gnlivestrm1</yt:videoId><title>Live</title><published>2030-01-01T10:00:00Z</published></entry>
      <entry><yt:videoId>l8qxFcaLSM4</yt:videoId><title>Again</title><published>2020-01-01T10:00:00Z</published></entry>
    </feed>`
    const fetchText: FetchText = async (url) => {
      if (url === videosFeedUrl(GAMERS_NEXUS)) return { status: 200, text: rssFeed }
      if (url === liveFeedUrl(GAMERS_NEXUS)) return { status: 200, text: live }
      return { status: 500, text: '' }
    }
    const feed = await createFeedService(fetchText).get([gamersNexus], false)

    expect(feed.videos.map((video) => video.id)).toEqual(['gnlivestrm1', 'KNVKzPHgg4M', 'l8qxFcaLSM4'])
    expect(feed.videos[0]).toMatchObject({ channelId: GAMERS_NEXUS, channelName: 'Gamers Nexus', live: true })
    // A video in both feeds is the live feed's, with its live mark.
    expect(feed.videos[2]).toMatchObject({ title: 'Again', live: true })
    expect(feed.videos[1]?.live).toBeUndefined()
    expect(feed.failedChannels).toEqual([])
  })

  it('does not count a channel without live streams as failed', async () => {
    const feed = await createFeedService(async (url) => (isLiveFeed(url) ? { status: 404, text: '' } : { status: 200, text: rssFeed })).get([gamersNexus], false)
    expect(feed.videos.map((video) => video.id)).toEqual(['l8qxFcaLSM4', 'KNVKzPHgg4M'])
    expect(feed.failedChannels).toEqual([])
  })

  it('fetches again once the feed is older than the refresh time, and with no refresh time only when asked', async () => {
    let time = 0
    let maxAge: number | undefined = 3 * 60 * 60_000
    const requested: string[] = []
    const service = createFeedService(async (url) => {
      requested.push(url)
      return { status: 200, text: rssFeed }
    }, () => time, undefined, undefined, () => maxAge)
    const fetches = (): number => requested.filter((url) => !isLiveFeed(url)).length

    await service.get([gamersNexus], false)
    time = 3 * 60 * 60_000 - 1
    await service.get([gamersNexus], false)
    expect(fetches()).toBe(1)
    time = 3 * 60 * 60_000
    await service.get([gamersNexus], false)
    expect(fetches()).toBe(2)

    maxAge = undefined
    time = 1000 * 60 * 60_000
    await service.get([gamersNexus], false)
    expect(fetches()).toBe(2)
    await service.get([gamersNexus], true)
    expect(fetches()).toBe(3)
  })

  it('fetches at most once an hour unless refreshed', async () => {
    let time = 0
    let requests = 0
    const service = createFeedService(async (url) => {
      if (!isLiveFeed(url)) requests++
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

  describe('feed kept between starts', () => {
    function memoryCache(saved?: SavedFeed): FeedCache & { saved: SavedFeed | undefined } {
      return {
        saved,
        load() {
          return this.saved
        },
        save(feed) {
          this.saved = feed
        }
      }
    }

    it('saves each fetch, with failed channels, and a new service shows it while under an hour old', async () => {
      const cache = memoryCache()
      let requests = 0
      const fetchText: FetchText = async (url) => {
        requests++
        return url === videosFeedUrl(GAMERS_NEXUS) ? { status: 200, text: rssFeed } : { status: 500, text: '' }
      }
      const first = await createFeedService(fetchText, () => 1000, undefined, cache).get([gamersNexus, level1], false)
      expect(cache.saved?.fetchedAt).toBe(1000)
      expect(cache.saved?.channels).toEqual([[GAMERS_NEXUS, expect.any(Array)], [LEVEL1_TECHS, null]])

      requests = 0
      const restarted = await createFeedService(fetchText, () => 1000 + FEED_MAX_AGE_MS - 1, undefined, cache).get([gamersNexus, level1], false)
      expect(requests).toBe(0)
      expect(restarted).toEqual(first)
    })

    it('fetches again after a restart once the saved feed is an hour old or ahead of the clock', async () => {
      let requests = 0
      const fetchText: FetchText = async (url) => {
        if (!isLiveFeed(url)) requests++
        return { status: 200, text: rssFeed }
      }
      const saved: SavedFeed = { fetchedAt: 5000, channels: [[GAMERS_NEXUS, []]] }
      await createFeedService(fetchText, () => 5000 + FEED_MAX_AGE_MS, undefined, memoryCache(saved)).get([gamersNexus], false)
      await createFeedService(fetchText, () => 4000, undefined, memoryCache(saved)).get([gamersNexus], false)
      expect(requests).toBe(2)
    })

    it('fetches only a channel added since the saved feed, and saves it too', async () => {
      const requested: string[] = []
      const cache = memoryCache({ fetchedAt: 0, channels: [[GAMERS_NEXUS, []]] })
      await createFeedService(async (url) => {
        requested.push(url)
        return { status: 200, text: rssFeed }
      }, () => 10, undefined, cache).get([gamersNexus, level1], false)
      expect(requested).toEqual([videosFeedUrl(LEVEL1_TECHS), liveFeedUrl(LEVEL1_TECHS)])
      expect(cache.saved?.channels.map(([id]) => id)).toEqual([GAMERS_NEXUS, LEVEL1_TECHS])
    })

    it('drops an unsubscribed channel from the saved feed on the next load, without fetching', async () => {
      let requests = 0
      const cache = memoryCache({ fetchedAt: 0, channels: [[GAMERS_NEXUS, []], [LEVEL1_TECHS, []]] })
      await createFeedService(async () => {
        requests++
        return { status: 200, text: rssFeed }
      }, () => 10, undefined, cache).get([gamersNexus], false)
      expect(requests).toBe(0)
      expect(cache.saved?.channels.map(([id]) => id)).toEqual([GAMERS_NEXUS])
    })

    it('keeps only the subscribed channels in the saved feed, and none once all are cleared', async () => {
      const cache = memoryCache()
      const service = createFeedService(async () => ({ status: 200, text: rssFeed }), () => 10, undefined, cache)
      await service.get([gamersNexus, level1], false)
      service.keepOnly([level1])
      expect(cache.saved?.channels.map(([id]) => id)).toEqual([LEVEL1_TECHS])
      service.keepOnly([])
      expect(cache.saved?.channels).toEqual([])
    })

    it('drops cleared channels from a saved feed that was not loaded yet', () => {
      const cache = memoryCache({ fetchedAt: 0, channels: [[GAMERS_NEXUS, []], [LEVEL1_TECHS, []]] })
      createFeedService(async () => ({ status: 200, text: rssFeed }), () => 10, undefined, cache).keepOnly([])
      expect(cache.saved?.channels).toEqual([])
    })
  })

  it('fetches only a new subscription, and nothing when one is removed', async () => {
    let time = 0
    const requested: string[] = []
    const service = createFeedService(async (url) => {
      requested.push(url)
      if (isLiveFeed(url)) return { status: 404, text: '' }
      return { status: 200, text: url === videosFeedUrl(LEVEL1_TECHS) ? feedWithVideo('level1tech1', '2026-11-22T10:00:00Z') : rssFeed }
    }, () => time)

    const first = await service.get([gamersNexus], false)
    time = 1000
    const added = await service.get([gamersNexus, level1], false)
    expect(requested).toEqual([videosFeedUrl(GAMERS_NEXUS), liveFeedUrl(GAMERS_NEXUS), videosFeedUrl(LEVEL1_TECHS), liveFeedUrl(LEVEL1_TECHS)])
    expect(added.videos.map((video) => video.id)).toContain('level1tech1')
    expect(added.updatedAt).toBe(first.updatedAt)

    const removed = await service.get([level1], false)
    expect(requested).toHaveLength(4)
    expect(removed.videos.map((video) => video.id)).toEqual(['level1tech1'])
  })

  it('sends the channels fetched so far after the first channel, then at most every half second', async () => {
    let time = 0
    const progress: FeedProgress[] = []
    const service = createFeedService(async (url) => {
      if (isLiveFeed(url)) return { status: 404, text: '' }
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

  describe('shorts', () => {
    const shortsFeed = `<feed><entry><yt:videoId>gnshortvid1</yt:videoId><title>Short</title><published>2030-01-01T10:00:00Z</published></entry></feed>`
    const shortLink = (id: string): string =>
      `<entry><yt:videoId>${id}</yt:videoId><title>${id}</title><link rel="alternate" href="https://www.youtube.com/shorts/${id}"/><published>2026-11-23T10:00:00Z</published></entry>`

    function fetcher(requested: string[]): FetchText {
      return async (url) => {
        requested.push(url)
        if (url === videosFeedUrl(GAMERS_NEXUS)) return { status: 200, text: rssFeed }
        if (url === shortsFeedUrl(GAMERS_NEXUS)) return { status: 200, text: shortsFeed }
        if (url === videosFeedUrl(HARDWARE_UNBOXED)) return { status: 404, text: '' }
        if (url === channelFeedUrl(HARDWARE_UNBOXED)) return { status: 200, text: `<feed>${shortLink('hwshortvid1')}</feed>` }
        return { status: 404, text: '' }
      }
    }

    it('fetches no Shorts feed while shorts do not show, and leaves out the shorts of a full feed', async () => {
      const requested: string[] = []
      const feed = await createFeedService(fetcher(requested)).get([gamersNexus, hardwareUnboxed], false)
      expect(requested.some((url) => url.includes('playlist_id=UUSH'))).toBe(false)
      expect(feed.videos.map((video) => video.id)).toEqual(['l8qxFcaLSM4', 'KNVKzPHgg4M'])
      expect(feed.failedChannels).toEqual([])
    })

    it('adds each channel\'s shorts with their short mark while shorts show, also those of a full feed', async () => {
      const requested: string[] = []
      const feed = await createFeedService(fetcher(requested), Date.now, undefined, undefined, undefined, () => true).get([gamersNexus, hardwareUnboxed], false)
      expect(requested).toContain(shortsFeedUrl(GAMERS_NEXUS))
      expect(feed.videos.map((video) => [video.id, video.short])).toEqual([
        ['gnshortvid1', true],
        ['hwshortvid1', true],
        ['l8qxFcaLSM4', undefined],
        ['KNVKzPHgg4M', undefined]
      ])
      expect(feed.videos[0]).toMatchObject({ channelId: GAMERS_NEXUS, channelName: 'Gamers Nexus' })
    })

    it('fetches again with the shorts once they show, and hides them again without fetching once they do not', async () => {
      let show = false
      const requested: string[] = []
      const cache = { saved: undefined as SavedFeed | undefined, load() { return this.saved }, save(feed: SavedFeed) { this.saved = feed } }
      const service = createFeedService(fetcher(requested), () => 10, undefined, cache, undefined, () => show)
      await service.get([gamersNexus], false)
      expect(cache.saved?.shorts).toBeUndefined()

      show = true
      const withShorts = await service.get([gamersNexus], false)
      expect(requested.filter((url) => url === videosFeedUrl(GAMERS_NEXUS))).toHaveLength(2)
      expect(withShorts.videos.map((video) => video.id)).toContain('gnshortvid1')
      expect(cache.saved?.shorts).toBe(true)

      show = false
      const without = await service.get([gamersNexus], false)
      expect(requested.filter((url) => url === videosFeedUrl(GAMERS_NEXUS))).toHaveLength(2)
      expect(without.videos.map((video) => video.id)).toEqual(['l8qxFcaLSM4', 'KNVKzPHgg4M'])

      // A restart keeps knowing that the saved feed has its shorts.
      show = true
      requested.length = 0
      await createFeedService(fetcher(requested), () => 10, undefined, cache, undefined, () => show).get([gamersNexus], false)
      expect(requested).toEqual([])
    })
  })

  it('shares one load between requests made while it runs', async () => {
    let requests = 0
    const service = createFeedService(async (url) => {
      if (!isLiveFeed(url)) requests++
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { status: 200, text: rssFeed }
    })
    await Promise.all([service.get([gamersNexus], false), service.get([gamersNexus], false)])
    expect(requests).toBe(1)
  })
})

describe('readSavedFeed', () => {
  const video = { id: 'l8qxFcaLSM4', title: 'HW News', channelId: GAMERS_NEXUS, channelName: 'Gamers Nexus', publishedAt: 1, viewsText: '', thumbnail: '' }

  it('reads a saved feed, with and without live marks', () => {
    const saved: SavedFeed = { fetchedAt: 7, channels: [[GAMERS_NEXUS, [video, { ...video, id: 'gnlivestrm1', live: true }]], [LEVEL1_TECHS, null]] }
    expect(readSavedFeed(JSON.stringify(saved))).toEqual(saved)
    expect(readSavedFeed(JSON.stringify({ fetchedAt: 7, channels: [[GAMERS_NEXUS, [{ ...video, live: 'yes' }]]] }))).toBeUndefined()
  })

  it('reads a saved feed fetched with shorts, with their short marks', () => {
    const saved: SavedFeed = { fetchedAt: 7, shorts: true, channels: [[GAMERS_NEXUS, [video, { ...video, id: 'gnshortvid1', short: true }]]] }
    expect(readSavedFeed(JSON.stringify(saved))).toEqual(saved)
    expect(readSavedFeed(JSON.stringify({ fetchedAt: 7, channels: [[GAMERS_NEXUS, [{ ...video, short: 1 }]]] }))).toBeUndefined()
  })

  it('ignores text that is not a saved feed', () => {
    expect(readSavedFeed('not json')).toBeUndefined()
    expect(readSavedFeed('null')).toBeUndefined()
    expect(readSavedFeed(JSON.stringify({ fetchedAt: 'today', channels: [] }))).toBeUndefined()
    expect(readSavedFeed(JSON.stringify({ fetchedAt: 1, channels: [[GAMERS_NEXUS, [{ id: 5 }]]] }))).toBeUndefined()
  })
})

describe('createFeedCacheFile', () => {
  function cacheFile(): string {
    const dir = join(TEST_DATA_DIR, 'feed-cache')
    mkdirSync(dir, { recursive: true })
    return join(dir, `${randomUUID()}.json`)
  }

  it('saves the feed to the file and reads it back', async () => {
    const file = cacheFile()
    const saved: SavedFeed = { fetchedAt: 9, channels: [[GAMERS_NEXUS, []]] }
    createFeedCacheFile(file).save(saved)
    await expect.poll(() => readSavedFeed(readFileSync(file, 'utf8'))).toEqual(saved)
    expect(createFeedCacheFile(file).load()).toEqual(saved)
  })

  it('gives nothing for a missing or broken file', () => {
    const file = cacheFile()
    expect(createFeedCacheFile(file).load()).toBeUndefined()
    writeFileSync(file, '{ broken')
    expect(createFeedCacheFile(file).load()).toBeUndefined()
  })
})
