import { describe, expect, it } from 'vitest'
import { innertubeOptions } from '../../packages/youtube/src/innertube'
import {
  FILL_COUNT,
  FILL_PAGES,
  FILTER_OPTIONS,
  addResults,
  createSearcher,
  fillPage,
  parseRawItems,
  parseRawResults,
  type PageResults,
  type SearchFeed
} from '../../packages/youtube/src/search'

const runs = (text: string) => ({ runs: [{ text }] })

const videoRenderer = {
  videoRenderer: {
    videoId: 'dQw4w9WgXcQ',
    title: runs('A video'),
    thumbnail: {
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 }
      ]
    },
    ownerText: {
      runs: [{ text: 'A channel', navigationEndpoint: { browseEndpoint: { browseId: 'UCabcdefghijklmnopqrstuv' } } }]
    },
    channelThumbnailSupportedRenderers: {
      channelThumbnailWithLinkRenderer: {
        thumbnail: { thumbnails: [{ url: 'https://yt3.ggpht.com/channel=s68', width: 68, height: 68 }] }
      }
    },
    lengthText: { simpleText: '3:33' },
    thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { text: { simpleText: '3:33' }, style: 'DEFAULT' } }],
    viewCountText: { simpleText: '1,234 views' },
    shortViewCountText: { simpleText: '1.2K views' },
    publishedTimeText: { simpleText: '2 years ago' },
    navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: '/watch?v=dQw4w9WgXcQ', webPageType: 'WEB_PAGE_TYPE_WATCH' } }, watchEndpoint: { videoId: 'dQw4w9WgXcQ' } }
  }
}

/** A plain video card with its own ID and title. */
function plainVideo(videoId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { videoRenderer: { ...videoRenderer.videoRenderer, videoId, title: runs(`Video ${videoId}`), ...extra } }
}

const shortVideoRenderer = plainVideo('shortcard01', {
  navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: '/shorts/shortcard01', webPageType: 'WEB_PAGE_TYPE_SHORTS' } }, reelWatchEndpoint: { videoId: 'shortcard01' } }
})

const membersOnlyRenderer = plainVideo('membersonly', {
  badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_MEMBERS_ONLY', label: 'Members only' } }]
})

const channelRenderer = {
  channelRenderer: {
    channelId: 'UCzyxwvutsrqponmlkjihgfe',
    title: { simpleText: 'Another channel' },
    thumbnail: {
      thumbnails: [
        { url: '//yt3.ggpht.com/avatar=s88', width: 88, height: 88 },
        { url: '//yt3.ggpht.com/avatar=s176', width: 176, height: 176 }
      ]
    },
    subscriberCountText: { simpleText: '@another' },
    videoCountText: { simpleText: '5.6M subscribers' },
    navigationEndpoint: { browseEndpoint: { browseId: 'UCzyxwvutsrqponmlkjihgfe' } }
  }
}

const gridVideoRenderer = {
  gridVideoRenderer: {
    videoId: 'gridvideo01',
    title: runs('A topic row video'),
    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/gridvideo01/hqdefault.jpg', width: 480, height: 360 }] },
    shortBylineText: { runs: [{ text: 'Row channel', navigationEndpoint: { browseEndpoint: { browseId: 'UCrowchannel000000000001' } } }] },
    thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { text: { simpleText: '10:01' }, style: 'DEFAULT' } }],
    viewCountText: { simpleText: '423,516 views' },
    shortViewCountText: { simpleText: '423K views' },
    publishedTimeText: { simpleText: '1 month ago' },
    navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: '/watch?v=gridvideo01', webPageType: 'WEB_PAGE_TYPE_WATCH' } }, watchEndpoint: { videoId: 'gridvideo01' } }
  }
}

const topicRow = {
  shelfRenderer: {
    title: { simpleText: 'Topic' },
    content: { horizontalListRenderer: { items: [gridVideoRenderer] } }
  }
}

const channelRow = {
  shelfRenderer: {
    title: { simpleText: 'Latest from A channel' },
    content: { verticalListRenderer: { items: [videoRenderer, plainVideo('rowvideo001')] } }
  }
}

function shortCard(videoId: string): Record<string, unknown> {
  return {
    shortsLockupViewModel: {
      entityId: `shorts-shelf-item-${videoId}`,
      accessibilityText: 'A short',
      onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: `/shorts/${videoId}`, webPageType: 'WEB_PAGE_TYPE_SHORTS' } }, reelWatchEndpoint: { videoId } } },
      overlayMetadata: { primaryText: { content: `Short ${videoId}` }, secondaryText: { content: '4.1M views' } },
      thumbnailViewModel: { thumbnailViewModel: { image: { sources: [{ url: `https://i.ytimg.com/vi/${videoId}/oar2.jpg`, width: 405, height: 720 }] } } }
    }
  }
}

const shortsRow = { gridShelfViewModel: { contents: [shortCard('shortrow001'), shortCard('shortcard01')] } }

function lockup(contentId: string, contentType: string, rows: { text: string; badge?: string }[][]): Record<string, unknown> {
  return {
    lockupViewModel: {
      contentId,
      contentType,
      contentImage: {
        thumbnailViewModel: {
          image: { sources: [{ url: `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`, width: 480, height: 270 }] },
          overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '12:34', badgeStyle: 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT' } }] } }]
        }
      },
      metadata: {
        lockupMetadataViewModel: {
          title: { content: `Card ${contentId}` },
          image: {
            decoratedAvatarViewModel: {
              avatar: { avatarViewModel: { image: { sources: [{ url: 'https://yt3.ggpht.com/card=s68', width: 68, height: 68 }] } } },
              rendererContext: { commandContext: { onTap: { innertubeCommand: { browseEndpoint: { browseId: 'UCcardchannel00000000001' } } } } }
            }
          },
          metadata: {
            contentMetadataViewModel: {
              metadataRows: rows.map((parts) => ({
                metadataParts: parts.map((part) => ({ text: { content: part.text } })),
                badges: parts.filter((part) => part.badge).map((part) => ({ badgeViewModel: { badgeText: part.text, badgeStyle: part.badge } }))
              }))
            }
          }
        }
      },
      rendererContext: {}
    }
  }
}

const CARD_ROWS = [[{ text: 'Card channel' }], [{ text: '5.6K views' }, { text: '3 days ago' }]]

describe('FILTER_OPTIONS', () => {
  it('asks for live videos with the Live filter', () => {
    expect(FILTER_OPTIONS.live).toEqual({ type: 'video', features: ['live'] })
    expect(FILTER_OPTIONS.videos).toEqual({ type: 'video' })
  })

  it('asks for shorts only with the Shorts filter', () => {
    expect(FILTER_OPTIONS.shorts).toEqual({ type: 'shorts' })
  })
})

describe('parseRawResults', () => {
  it('separates videos and channels and skips other items', () => {
    const results = parseRawResults([channelRenderer, { shelfRenderer: {} }, videoRenderer])

    expect(results.videos).toEqual([{
      id: 'dQw4w9WgXcQ',
      title: 'A video',
      channelId: 'UCabcdefghijklmnopqrstuv',
      channelName: 'A channel',
      channelAvatar: 'https://yt3.ggpht.com/channel=s68',
      durationText: '3:33',
      viewsText: '1,234 views',
      publishedText: '2 years ago',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      isLive: false
    }])

    expect(results.channels).toEqual([{
      id: 'UCzyxwvutsrqponmlkjihgfe',
      name: 'Another channel',
      handle: '@another',
      subscribersText: '5.6M subscribers',
      avatar: 'https://yt3.ggpht.com/avatar=s88'
    }])
    expect(results.shorts).toEqual([])
  })

  it('reads the subscriber count from its old place when there is no handle', () => {
    const old = {
      channelRenderer: {
        ...channelRenderer.channelRenderer,
        subscriberCountText: { simpleText: '10K subscribers' },
        videoCountText: { simpleText: '50 videos' }
      }
    }
    const [channel] = parseRawResults([old]).channels
    expect(channel?.handle).toBe('')
    expect(channel?.subscribersText).toBe('10K subscribers')
  })

  it('takes the videos of topic rows and channel rows, each video once', () => {
    const results = parseRawResults([videoRenderer, topicRow, channelRow])
    expect(results.videos.map((video) => video.id)).toEqual(['dQw4w9WgXcQ', 'gridvideo01', 'rowvideo001'])
    expect(results.videos[1]).toEqual({
      id: 'gridvideo01',
      title: 'A topic row video',
      channelId: 'UCrowchannel000000000001',
      channelName: 'Row channel',
      channelAvatar: '',
      durationText: '10:01',
      viewsText: '423,516 views',
      publishedText: '1 month ago',
      thumbnail: 'https://i.ytimg.com/vi/gridvideo01/hqdefault.jpg',
      isLive: false
    })
  })

  it('reads a newer video card with its channel', () => {
    const [video] = parseRawResults([lockup('cardvideo01', 'LOCKUP_CONTENT_TYPE_VIDEO', CARD_ROWS)]).videos
    expect(video).toEqual({
      id: 'cardvideo01',
      title: 'Card cardvideo01',
      channelId: 'UCcardchannel00000000001',
      channelName: 'Card channel',
      channelAvatar: 'https://yt3.ggpht.com/card=s68',
      durationText: '12:34',
      viewsText: '5.6K views',
      publishedText: '3 days ago',
      thumbnail: 'https://i.ytimg.com/vi/cardvideo01/hqdefault.jpg',
      isLive: false
    })
  })

  it('leaves out members-only videos, playlists and mixes', () => {
    const results = parseRawResults([
      membersOnlyRenderer,
      lockup('PLplaylist01', 'LOCKUP_CONTENT_TYPE_PLAYLIST', CARD_ROWS),
      lockup('RDmix0000001', 'LOCKUP_CONTENT_TYPE_PLAYLIST', CARD_ROWS),
      lockup('cardmember1', 'LOCKUP_CONTENT_TYPE_VIDEO', [[{ text: 'Members only', badge: 'BADGE_MEMBERS_ONLY' }], [{ text: '5.6K views' }]]),
      videoRenderer
    ])
    expect(results.videos.map((video) => video.id)).toEqual(['dQw4w9WgXcQ'])
    expect(results.shorts).toEqual([])
  })

  it('sets shorts apart: plain cards that open the Shorts player and the cards of Shorts rows', () => {
    const results = parseRawResults([shortVideoRenderer, videoRenderer, shortsRow])
    expect(results.videos.map((video) => video.id)).toEqual(['dQw4w9WgXcQ'])
    expect(results.shorts.map((video) => video.id)).toEqual(['shortcard01', 'shortrow001'])
    expect(results.shorts[1]).toEqual({
      id: 'shortrow001',
      title: 'Short shortrow001',
      channelId: '',
      channelName: '',
      channelAvatar: '',
      durationText: '',
      viewsText: '4.1M views',
      publishedText: '',
      thumbnail: 'https://i.ytimg.com/vi/shortrow001/oar2.jpg',
      isLive: false
    })
  })
})

describe('addResults', () => {
  it('adds only what the earlier pages do not hold', () => {
    const target = parseRawResults([videoRenderer, channelRenderer, shortsRow])
    addResults(target, parseRawResults([videoRenderer, plainVideo('nextvideo01'), channelRenderer, shortCard('shortrow001'), shortCard('nextshort01')]))
    expect(target.videos.map((video) => video.id)).toEqual(['dQw4w9WgXcQ', 'nextvideo01'])
    expect(target.channels).toHaveLength(1)
    expect(target.shorts.map((video) => video.id)).toEqual(['shortrow001', 'shortcard01', 'nextshort01'])
  })
})

/** Search pages that hold the given numbers of plain videos, each page linked to the next. */
function feedPages(counts: number[], failAt?: number): { first: SearchFeed; loaded: () => number } {
  let loaded = 1
  function page(index: number): SearchFeed {
    const items = Array.from({ length: counts[index] ?? 0 }, (_, n) => plainVideo(`p${index}v${String(n).padStart(7, '0')}`))
    return {
      results: parseRawItems(items),
      has_continuation: index + 1 < counts.length,
      async getContinuation() {
        if (index + 1 === failAt) throw new Error('YouTube answered 500')
        loaded++
        return page(index + 1)
      }
    }
  }
  return { first: page(0), loaded: () => loaded }
}

const ids = (results: PageResults) => results.videos.map((video) => video.id)

describe('fillPage', () => {
  it('keeps a full page as it is', async () => {
    const pages = feedPages([FILL_COUNT, 5])
    const filled = await fillPage(pages.first)
    expect(filled.results.videos).toHaveLength(FILL_COUNT)
    expect(pages.loaded()).toBe(1)
    expect(filled.last.has_continuation).toBe(true)
  })

  it('fills a thin page with up to two next pages', async () => {
    const pages = feedPages([5, 5, 5, 5, 5])
    const filled = await fillPage(pages.first)
    expect(FILL_PAGES).toBe(2)
    expect(filled.results.videos).toHaveLength(15)
    expect(pages.loaded()).toBe(3)
    expect(filled.last.has_continuation).toBe(true)
  })

  it('stops filling once the page is full', async () => {
    const pages = feedPages([12, 12, 12])
    const filled = await fillPage(pages.first)
    expect(filled.results.videos).toHaveLength(24)
    expect(pages.loaded()).toBe(2)
  })

  it('stops at the last page', async () => {
    const pages = feedPages([3, 4])
    const filled = await fillPage(pages.first)
    expect(filled.results.videos).toHaveLength(7)
    expect(filled.last.has_continuation).toBe(false)
  })

  it('keeps what it has when a next page fails, and the failed page can still be loaded', async () => {
    const pages = feedPages([5, 5, 5], 2)
    const filled = await fillPage(pages.first)
    expect(filled.results.videos).toHaveLength(10)
    expect(filled.last.has_continuation).toBe(true)
  })

  it('does not count shorts', async () => {
    const shortsOnly: SearchFeed = {
      results: parseRawItems([shortsRow]),
      has_continuation: true,
      getContinuation: async () => feedPages([FILL_COUNT]).first
    }
    const filled = await fillPage(shortsOnly)
    expect(filled.results.videos).toHaveLength(FILL_COUNT)
    expect(filled.results.shorts).toHaveLength(2)
  })
})

describe('createSearcher', () => {
  function searcherOver(first: SearchFeed) {
    const innertube = { search: async () => first } as unknown as Awaited<ReturnType<Parameters<typeof createSearcher>[0]>>
    return createSearcher(async () => innertube)
  }

  it('loads the next page before it is asked for', async () => {
    const pages = feedPages([FILL_COUNT, FILL_COUNT, FILL_COUNT])
    const searcher = searcherOver(pages.first)
    const page = await searcher.search({ query: 'cats', filter: 'all' })
    expect(page.videos).toHaveLength(FILL_COUNT)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pages.loaded()).toBe(2)

    const next = await searcher.search({ query: 'cats', filter: 'all', continuation: page.continuation! })
    expect(ids(next)[0]).toBe('p1v0000000')
    expect(next.continuation).toBeDefined()
  })

  it('gives no next page on the last page', async () => {
    const page = await searcherOver(feedPages([3]).first).search({ query: 'cats', filter: 'all' })
    expect(page.continuation).toBeUndefined()
  })

  it('loads a next page again when loading it ahead failed', async () => {
    let failures = 1
    const second = feedPages([FILL_COUNT]).first
    const first: SearchFeed = {
      ...feedPages([FILL_COUNT]).first,
      has_continuation: true,
      async getContinuation() {
        if (failures-- > 0) throw new Error('YouTube answered 500')
        return second
      }
    }
    const searcher = searcherOver(first)
    const page = await searcher.search({ query: 'cats', filter: 'all' })
    const next = await searcher.search({ query: 'cats', filter: 'all', continuation: page.continuation! })
    expect(next.videos).toHaveLength(FILL_COUNT)
  })

  it('refuses a next page it does not know', async () => {
    await expect(searcherOver(feedPages([3]).first).search({ query: 'cats', filter: 'all', continuation: 'unknown' }))
      .rejects.toThrow('These search results have expired. Search again.')
  })
})

describe('innertubeOptions', () => {
  it('makes the session here, without asking YouTube for its settings first', () => {
    expect(innertubeOptions(fetch, 'agent')).toMatchObject({ generate_session_locally: true, retrieve_innertube_config: false, user_agent: 'agent' })
  })
})
