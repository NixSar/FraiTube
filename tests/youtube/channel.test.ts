import { describe, expect, it } from 'vitest'
import { createChannelReader, readChannelTexts, toChannelVideo, type ChannelVideoParts } from '../../packages/youtube/src/channel'
import { parseRawItems } from '../../packages/youtube/src/search'

const channel = { id: 'UCabcdefghijklmnopqrstuv', name: 'A channel', avatar: 'https://yt3.ggpht.com/avatar=s88' }

const parts: ChannelVideoParts = {
  id: 'dQw4w9WgXcQ',
  title: 'A video',
  thumbnails: [
    { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480 },
    { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', width: 320 },
    { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120 }
  ],
  badges: [{ text: '12:34', style: 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT' }],
  details: ['321K', '16 hours ago']
}

describe('toChannelVideo', () => {
  it('reads a video with its length, views and date, under the channel it belongs to', () => {
    expect(toChannelVideo(parts, channel)).toEqual({
      id: 'dQw4w9WgXcQ',
      title: 'A video',
      channelId: 'UCabcdefghijklmnopqrstuv',
      channelName: 'A channel',
      channelAvatar: 'https://yt3.ggpht.com/avatar=s88',
      durationText: '12:34',
      viewsText: '321K views',
      publishedText: '16 hours ago',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      isLive: false
    })
  })

  it('reads a live video from its LIVE badge, without a length', () => {
    const live = toChannelVideo({ ...parts, badges: [{ text: 'LIVE', style: 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE' }], details: ['1.2K watching'] }, channel)
    expect(live.isLive).toBe(true)
    expect(live.durationText).toBe('')
    expect(live.viewsText).toBe('1.2K watching')
    expect(live.publishedText).toBe('')
  })

  it('keeps view texts that already say what they count', () => {
    expect(toChannelVideo({ ...parts, details: ['No views', '1 day ago'] }, channel).viewsText).toBe('No views')
  })
})

describe('createChannelReader', () => {
  type GetInnertube = Parameters<typeof createChannelReader>[0]

  function shortCard(videoId: string): Record<string, unknown> {
    return {
      shortsLockupViewModel: {
        entityId: `shorts-shelf-item-${videoId}`,
        onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: `/shorts/${videoId}`, webPageType: 'WEB_PAGE_TYPE_SHORTS' } }, reelWatchEndpoint: { videoId } } },
        overlayMetadata: { primaryText: { content: `Short ${videoId}` }, secondaryText: { content: '4.1M views' } }
      }
    }
  }

  function videoCard(videoId: string, url: string, pageType: string): Record<string, unknown> {
    return {
      videoRenderer: {
        videoId,
        title: { runs: [{ text: `Video ${videoId}` }] },
        thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 }] },
        ownerText: { runs: [{ text: 'A channel', navigationEndpoint: { browseEndpoint: { browseId: channel.id } } }] },
        navigationEndpoint: { commandMetadata: { webCommandMetadata: { url, webPageType: pageType } } }
      }
    }
  }

  function reader(items: { shorts?: unknown[]; search?: unknown[]; hasShorts?: boolean }): ReturnType<typeof createChannelReader> {
    const feed = (raw: unknown[]) => ({ videos: parseRawItems(raw), has_continuation: false, getContinuation: () => Promise.reject(new Error('none')) })
    const found = {
      header: undefined,
      metadata: { title: channel.name, avatar: [] },
      has_shorts: items.hasShorts ?? true,
      has_search: true,
      has_videos: true,
      getShorts: async () => feed(items.shorts ?? []),
      search: async () => feed(items.search ?? [])
    }
    return createChannelReader((() => Promise.resolve({ getChannel: async () => found })) as unknown as GetInnertube)
  }

  it('lists the Shorts tab as shorts of the channel', async () => {
    const page = await reader({ shorts: [shortCard('chshort0001'), shortCard('chshort0002')] }).videos({ channelId: channel.id, tab: 'shorts' })
    expect(page.videos.map((video) => [video.id, video.isShort, video.channelId, video.channelName])).toEqual([
      ['chshort0001', true, channel.id, channel.name],
      ['chshort0002', true, channel.id, channel.name]
    ])
    expect(page.videos[0]?.thumbnail).toBe('https://i.ytimg.com/vi/chshort0001/hqdefault.jpg')
  })

  it('gives no shorts for a channel without a Shorts tab', async () => {
    const page = await reader({ hasShorts: false }).videos({ channelId: channel.id, tab: 'shorts' })
    expect(page.videos).toEqual([])
    expect(page.channel?.name).toBe(channel.name)
  })

  it('marks the shorts among a channel search\'s results', async () => {
    const page = await reader({
      search: [videoCard('chvideo0001', '/watch?v=chvideo0001', 'WEB_PAGE_TYPE_WATCH'), videoCard('chshort0003', '/shorts/chshort0003', 'WEB_PAGE_TYPE_SHORTS')]
    }).videos({ channelId: channel.id, query: 'video' })
    expect(page.videos.map((video) => [video.id, video.isShort])).toEqual([['chvideo0001', undefined], ['chshort0003', true]])
  })
})

describe('readChannelTexts', () => {
  it('finds the handle and the subscriber count among the texts under the name', () => {
    expect(readChannelTexts(['@achannel', '2.75M subscribers', '1.2K videos'])).toEqual({ handle: '@achannel', subscribersText: '2.75M subscribers' })
  })

  it('gives empty texts when YouTube shows neither', () => {
    expect(readChannelTexts(['1.2K videos'])).toEqual({ handle: '', subscribersText: '' })
  })
})
