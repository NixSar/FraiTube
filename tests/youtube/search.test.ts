import { describe, expect, it } from 'vitest'
import { FILTER_OPTIONS, parseRawResults } from '../../packages/youtube/src/search'

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
    publishedTimeText: { simpleText: '2 years ago' }
  }
}

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

describe('FILTER_OPTIONS', () => {
  it('asks for live videos with the Live filter', () => {
    expect(FILTER_OPTIONS.live).toEqual({ type: 'video', features: ['live'] })
    expect(FILTER_OPTIONS.videos).toEqual({ type: 'video' })
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
})
