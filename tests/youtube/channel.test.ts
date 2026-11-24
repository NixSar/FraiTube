import { describe, expect, it } from 'vitest'
import { readChannelTexts, toChannelVideo, type ChannelVideoParts } from '../../packages/youtube/src/channel'

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

describe('readChannelTexts', () => {
  it('finds the handle and the subscriber count among the texts under the name', () => {
    expect(readChannelTexts(['@achannel', '2.75M subscribers', '1.2K videos'])).toEqual({ handle: '@achannel', subscribersText: '2.75M subscribers' })
  })

  it('gives empty texts when YouTube shows neither', () => {
    expect(readChannelTexts(['1.2K videos'])).toEqual({ handle: '', subscribersText: '' })
  })
})
