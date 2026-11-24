import type { FeedVideo } from './types'

/** The channel's feed of regular videos, without Shorts and live streams. */
export function videosFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`
}

/** The channel's feed of live streams: running, ended and scheduled ones. */
export function liveFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV${channelId.slice(2)}`
}

/** The channel's full feed, used when the videos feed does not exist. */
export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
}

const VIDEO_ID = /^[\w-]{11}$/

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10))
    }
    return NAMED_ENTITIES[entity] ?? whole
  })
}

function tagText(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match?.[1] === undefined ? '' : decodeXmlText(match[1].trim())
}

function tagAttribute(xml: string, tag: string, attribute: string): string {
  const element = new RegExp(`<${tag}\\s[^>]*>`).exec(xml)?.[0] ?? ''
  const value = new RegExp(`\\s${attribute}="([^"]*)"`).exec(element)?.[1]
  return value === undefined ? '' : decodeXmlText(value)
}

const compact = new Intl.NumberFormat('en', { notation: 'compact' })

export function viewsText(views: number): string {
  return `${compact.format(views)} ${views === 1 ? 'view' : 'views'}`
}

/** Reads the videos of a YouTube RSS (Atom) feed. */
export function parseRssFeed(xml: string): FeedVideo[] {
  const feedChannelName = tagText(xml.split('<entry>')[0] ?? '', 'name')
  const videos: FeedVideo[] = []
  for (const [, entry = ''] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tagText(entry, 'yt:videoId')
    const publishedAt = Date.parse(tagText(entry, 'published'))
    if (!VIDEO_ID.test(id) || Number.isNaN(publishedAt)) continue
    const views = Number(tagAttribute(entry, 'media:statistics', 'views'))
    videos.push({
      id,
      title: tagText(entry, 'title'),
      channelId: tagText(entry, 'yt:channelId'),
      channelName: tagText(entry, 'name') || feedChannelName,
      publishedAt,
      viewsText: tagAttribute(entry, 'media:statistics', 'views') && Number.isFinite(views) ? viewsText(views) : '',
      // Built from the ID: the feed's own thumbnail hosts vary, and the pages only allow i.ytimg.com.
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
    })
  }
  return videos
}
