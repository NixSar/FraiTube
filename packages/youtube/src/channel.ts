import { randomUUID } from 'node:crypto'
import { YTNodes, type Helpers, type Innertube } from 'youtubei.js'
import { toVideo } from './search'
import type { ChannelInfo, ChannelVideosPage, ChannelVideosRequest, VideoResult } from './types'

type YTNode = Helpers.YTNode
type Thumbnail = { url: string; width: number }
/** A page of channel videos that can load its next page. */
interface VideosFeed {
  readonly videos: readonly YTNode[]
  readonly has_continuation: boolean
  getContinuation(): Promise<VideosFeed>
}

/** How many channel pages keep their next page available. */
const REMEMBERED_PAGES = 50

/** What a channel video item gives, before it becomes a video result. */
export interface ChannelVideoParts {
  id: string
  title: string
  thumbnails: readonly Thumbnail[]
  /** The texts on the picture, such as its length or LIVE, with their styles. */
  badges: readonly { text: string; style: string }[]
  /** The texts under the title, such as "321K" and "16h ago". */
  details: readonly string[]
}

/** The smallest image at least `minWidth` wide, or the largest one there is. */
function pickImage(images: readonly Thumbnail[] | undefined, minWidth: number): string {
  const sorted = [...(images ?? [])].sort((a, b) => a.width - b.width)
  const url = (sorted.find((image) => image.width >= minWidth) ?? sorted.at(-1))?.url ?? ''
  return url.startsWith('//') ? `https:${url}` : url
}

/** A channel video as a video result, with the channel it belongs to. */
export function toChannelVideo(parts: ChannelVideoParts, channel: Pick<ChannelInfo, 'id' | 'name' | 'avatar'>): VideoResult {
  const live = parts.badges.find((badge) => badge.style.includes('LIVE') || badge.text === 'LIVE')
  const length = parts.badges.find((badge) => /^\d+(:\d{2})+$/.test(badge.text))
  const [views = '', published = ''] = parts.details
  return {
    id: parts.id,
    title: parts.title,
    channelId: channel.id,
    channelName: channel.name,
    channelAvatar: channel.avatar,
    durationText: live ? '' : length?.text ?? '',
    viewsText: views && /^[\d.,]+[KMB]?$/.test(views) ? `${views} views` : views,
    publishedText: published,
    thumbnail: pickImage(parts.thumbnails, 320),
    isLive: live !== undefined
  }
}

/** The channel's handle and subscriber count, from the texts YouTube shows under its name. */
export function readChannelTexts(texts: readonly string[]): Pick<ChannelInfo, 'handle' | 'subscribersText'> {
  return {
    handle: texts.find((text) => text.startsWith('@')) ?? '',
    subscribersText: texts.find((text) => /subscriber/i.test(text)) ?? ''
  }
}

/** What a channel video item gives, or undefined for anything that is not a video. */
function partsOf(node: YTNode): ChannelVideoParts | undefined {
  if (!node.is(YTNodes.LockupView) || node.content_type !== 'VIDEO' || !node.content_id) {
    return undefined
  }
  const image = node.content_image?.is(YTNodes.ThumbnailView) ? node.content_image : undefined
  const badges: { text: string; style: string }[] = []
  for (const overlay of image?.overlays ?? []) {
    if (overlay.is(YTNodes.ThumbnailBottomOverlayView, YTNodes.ThumbnailOverlayBadgeView)) {
      for (const badge of overlay.badges) {
        badges.push({ text: badge.text ?? '', style: badge.badge_style ?? '' })
      }
    }
  }
  const details = (node.metadata?.metadata?.metadata_rows ?? [])
    .flatMap((row) => row.metadata_parts ?? [])
    .map((part) => part.text?.toString().trim() ?? '')
    .filter(Boolean)
  return {
    id: node.content_id,
    title: node.metadata?.title?.toString().trim() ?? '',
    thumbnails: image?.image ?? [],
    badges,
    details
  }
}

export interface ChannelReader {
  videos(request: ChannelVideosRequest): Promise<ChannelVideosPage>
}

export function createChannelReader(getInnertube: () => Promise<Innertube>): ChannelReader {
  const pending = new Map<string, { feed: VideosFeed; channel: ChannelInfo }>()

  function remember(feed: VideosFeed, channel: ChannelInfo): string | undefined {
    if (!feed.has_continuation) return undefined
    const token = randomUUID()
    pending.set(token, { feed, channel })
    for (const oldest of pending.keys()) {
      if (pending.size <= REMEMBERED_PAGES) break
      pending.delete(oldest)
    }
    return token
  }

  /** A video item of the channel's videos or search results, or undefined for anything that is not a video. */
  function videoOf(node: YTNode, channel: ChannelInfo): VideoResult | undefined {
    if (node.is(YTNodes.Video)) {
      return { ...toVideo(node), channelId: channel.id, channelName: channel.name, channelAvatar: channel.avatar }
    }
    const parts = partsOf(node)
    return parts && toChannelVideo(parts, channel)
  }

  function page(feed: VideosFeed, channel: ChannelInfo): Omit<ChannelVideosPage, 'channel'> {
    const videos = feed.videos.map((node) => videoOf(node, channel)).filter((video) => video !== undefined)
    return { videos, continuation: remember(feed, channel) }
  }

  return {
    async videos(request) {
      if (request.continuation) {
        const previous = pending.get(request.continuation)
        if (!previous) {
          throw new Error('This channel page has expired. Open the channel again.')
        }
        pending.delete(request.continuation)
        return page(await previous.feed.getContinuation(), previous.channel)
      }
      const found = await (await getInnertube()).getChannel(request.channelId)
      const header = found.header?.is(YTNodes.PageHeader) ? found.header.content : undefined
      const texts = (header?.metadata?.metadata_rows ?? [])
        .flatMap((row) => row.metadata_parts ?? [])
        .map((part) => part.text?.toString().trim() ?? '')
      const channel: ChannelInfo = {
        id: request.channelId,
        name: found.metadata.title ?? '',
        ...readChannelTexts(texts),
        avatar: pickImage(found.metadata.avatar, 88)
      }
      let feed: VideosFeed
      if (request.query) {
        if (!found.has_search) {
          throw new Error('This channel cannot be searched.')
        }
        feed = await found.search(request.query)
      } else {
        feed = found.has_videos ? await found.getVideos() : found
      }
      return { channel, ...page(feed, channel) }
    }
  }
}
