import { randomUUID } from 'node:crypto'
import { Innertube, Parser, YTNodes, type Helpers, type Types, type YT } from 'youtubei.js'
import type { ChannelResult, SearchFilter, SearchPage, SearchRequest, VideoResult } from './types'

type YTNode = Helpers.YTNode
type Thumbnail = { url: string; width: number }

/** What YouTube is asked for with each filter. */
export const FILTER_OPTIONS: Record<SearchFilter, Types.SearchFilters> = {
  all: { type: 'all' },
  videos: { type: 'video' },
  live: { type: 'video', features: ['live'] },
  channels: { type: 'channel' },
  shorts: { type: 'shorts' }
}
/** How many unfinished searches keep their next page available. */
const REMEMBERED_SEARCHES = 50
/** A page with fewer videos and channels than this takes the next pages too. */
export const FILL_COUNT = 20
/** How many next pages one page may take to reach FILL_COUNT. */
export const FILL_PAGES = 2

const SHORTS_PAGE_TYPE = 'WEB_PAGE_TYPE_SHORTS'
const MEMBERS_ONLY_BADGES = new Set(['BADGE_STYLE_TYPE_MEMBERS_ONLY', 'BADGE_MEMBERS_ONLY'])

function absolute(url: string | undefined): string {
  if (!url) return ''
  return url.startsWith('//') ? `https:${url}` : url
}

/** The smallest image at least `minWidth` wide, or the largest one there is. */
function pickImage(images: readonly Thumbnail[] | undefined, minWidth: number): string {
  const sorted = [...(images ?? [])].sort((a, b) => a.width - b.width)
  return absolute((sorted.find((image) => image.width >= minWidth) ?? sorted.at(-1))?.url)
}

function text(value: { toString(): string } | undefined | null): string {
  return value?.toString().trim() ?? ''
}

/** True when a link opens the Shorts player. */
export function opensShort(endpoint: YTNodes.NavigationEndpoint | undefined): boolean {
  const metadata = endpoint?.metadata
  return metadata?.page_type === SHORTS_PAGE_TYPE || (metadata?.url?.startsWith('/shorts/') ?? false)
}

export function toVideo(node: YTNodes.Video): VideoResult {
  return {
    id: node.video_id,
    title: text(node.title),
    channelId: node.author.id,
    channelName: node.author.name,
    channelAvatar: pickImage(node.author.thumbnails, 68),
    durationText: node.duration.text ?? '',
    viewsText: text(node.view_count ?? node.short_view_count),
    publishedText: text(node.published),
    thumbnail: pickImage(node.thumbnails, 320),
    isLive: node.is_live
  }
}

function fromGridVideo(node: YTNodes.GridVideo): VideoResult {
  const isLive = node.thumbnail_overlays.some((overlay) => overlay.is(YTNodes.ThumbnailOverlayTimeStatus) && overlay.style === 'LIVE')
  return {
    id: node.video_id,
    title: text(node.title),
    channelId: node.author.id,
    channelName: node.author.name,
    channelAvatar: pickImage(node.author.thumbnails, 68),
    durationText: isLive ? '' : text(node.duration),
    viewsText: text(node.views.isEmpty() ? node.short_view_count : node.views),
    publishedText: text(node.published),
    thumbnail: pickImage(node.thumbnails, 320),
    isLive
  }
}

/** A newer video card as a video result, or undefined when it is no video or only for channel members. */
function fromLockup(node: YTNodes.LockupView): VideoResult | undefined {
  const rows = node.metadata?.metadata?.metadata_rows ?? []
  if (!node.content_id || rows.some((row) => row.badges?.some((badge) => MEMBERS_ONLY_BADGES.has(badge.style)))) {
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
  const live = badges.some((badge) => badge.style.includes('LIVE') || badge.text === 'LIVE')
  const length = badges.find((badge) => /^\d+(:\d{2})+$/.test(badge.text))
  const parts = rows
    .flatMap((row) => row.metadata_parts ?? [])
    .map((part) => text(part.text))
    .filter(Boolean)
  const viewsText = parts.find((part) => /\b(views?|watching)\b/i.test(part)) ?? ''
  const publishedText = parts.find((part) => /\bago\b|^(Streamed|Premiered|Premieres|Scheduled)\b/i.test(part)) ?? ''
  const avatar = node.metadata?.image?.is(YTNodes.DecoratedAvatarView) ? node.metadata.image : undefined
  const channelId: unknown = avatar?.renderer_context?.command_context?.on_tap?.payload?.browseId
  return {
    id: node.content_id,
    title: text(node.metadata?.title),
    channelId: typeof channelId === 'string' ? channelId : '',
    channelName: parts.find((part) => part !== viewsText && part !== publishedText) ?? '',
    channelAvatar: pickImage(avatar?.avatar?.image, 68),
    durationText: live ? '' : length?.text ?? '',
    viewsText,
    publishedText,
    thumbnail: pickImage(image?.image, 320),
    isLive: live
  }
}

/** A card of a Shorts row. It names no channel. */
export function fromShortsLockup(node: YTNodes.ShortsLockupView): VideoResult | undefined {
  const id: unknown = node.on_tap_endpoint?.payload?.videoId
  if (typeof id !== 'string' || !id) {
    return undefined
  }
  return {
    id,
    title: text(node.overlay_metadata?.primary_text),
    channelId: '',
    channelName: '',
    channelAvatar: '',
    durationText: '',
    viewsText: text(node.overlay_metadata?.secondary_text),
    publishedText: '',
    thumbnail: pickImage(node.thumbnail_view_model?.image ?? node.thumbnail, 320) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isLive: false
  }
}

function toChannel(node: YTNodes.Channel): ChannelResult {
  // YouTube now puts the handle where the subscriber count used to be, and the subscriber count in its place.
  const first = text(node.subscriber_count)
  const second = text(node.video_count)
  const hasHandle = first.startsWith('@')
  return {
    id: node.id,
    name: node.author.name,
    handle: hasHandle ? first : '',
    subscribersText: hasHandle ? second : first,
    avatar: pickImage(node.author.thumbnails, 88)
  }
}

export type PageResults = Pick<SearchPage, 'videos' | 'channels' | 'shorts'>

/** Adds the results of a later page, leaving out what the earlier pages already hold. */
export function addResults(target: PageResults, more: PageResults): void {
  const seenVideos = new Set([...target.videos, ...target.shorts].map((video) => video.id))
  const seenChannels = new Set(target.channels.map((channel) => channel.id))
  target.videos.push(...more.videos.filter((video) => !seenVideos.has(video.id)))
  target.shorts.push(...more.shorts.filter((video) => !seenVideos.has(video.id)))
  target.channels.push(...more.channels.filter((channel) => !seenChannels.has(channel.id)))
}

/**
 * Splits YouTube's search result items into videos, shorts and channels. Videos inside topic rows and
 * channel rows count as videos, and each video comes once. Members-only videos, playlists, mixes and
 * posts are left out.
 */
export function toResults(nodes: readonly YTNode[]): PageResults {
  const results: PageResults = { videos: [], channels: [], shorts: [] }
  const seen = new Set<string>()
  function add(list: VideoResult[], video: VideoResult | undefined): void {
    if (video && !seen.has(video.id)) {
      seen.add(video.id)
      list.push(video)
    }
  }
  function visit(node: YTNode): void {
    if (node.is(YTNodes.Video)) {
      if (!node.badges.some((badge) => MEMBERS_ONLY_BADGES.has(badge.style ?? ''))) {
        add(opensShort(node.endpoint) ? results.shorts : results.videos, toVideo(node))
      }
    } else if (node.is(YTNodes.GridVideo)) {
      add(opensShort(node.endpoint) ? results.shorts : results.videos, fromGridVideo(node))
    } else if (node.is(YTNodes.LockupView)) {
      if (node.content_type === 'VIDEO') add(results.videos, fromLockup(node))
      else if (node.content_type === 'SHORT') add(results.shorts, fromLockup(node))
    } else if (node.is(YTNodes.ShortsLockupView)) {
      add(results.shorts, fromShortsLockup(node))
    } else if (node.is(YTNodes.Channel)) {
      if (!results.channels.some((channel) => channel.id === node.id)) results.channels.push(toChannel(node))
    } else if (node.is(YTNodes.Shelf)) {
      if (node.content?.is(YTNodes.VerticalList, YTNodes.HorizontalList)) node.content.items.forEach(visit)
    } else if (node.is(YTNodes.GridShelfView)) {
      node.contents.forEach(visit)
    }
  }
  nodes.forEach(visit)
  return results
}

/** Parses raw search result items, as YouTube sends them. */
export function parseRawItems(items: unknown[]): YTNode[] {
  return [...Parser.parseArray(items as Parameters<typeof Parser.parseArray>[0])]
}

/** Parses raw search result items, as YouTube sends them, into videos, shorts and channels. */
export function parseRawResults(items: unknown[]): PageResults {
  return toResults(parseRawItems(items))
}

/** A page of search results that can load its next page, as YouTube's search gives it. */
export interface SearchFeed {
  readonly results?: readonly YTNode[] | null
  readonly has_continuation: boolean
  getContinuation(): Promise<SearchFeed>
}

/** A page with what the next pages added to fill it, and the last page taken, which loads what comes after. */
export interface FilledPage {
  results: PageResults
  last: SearchFeed
}

/**
 * A page of results, filled with up to FILL_PAGES next pages while it has fewer than FILL_COUNT videos and
 * channels. A next page that fails to load ends the filling; what comes after it can still be loaded.
 */
export async function fillPage(first: SearchFeed): Promise<FilledPage> {
  const results = toResults(first.results ?? [])
  let last = first
  for (let taken = 0; taken < FILL_PAGES && last.has_continuation && results.videos.length + results.channels.length < FILL_COUNT; taken++) {
    let next: SearchFeed
    try {
      next = await last.getContinuation()
    } catch {
      break
    }
    addResults(results, toResults(next.results ?? []))
    last = next
  }
  return { results, last }
}

export interface Searcher {
  search(request: SearchRequest): Promise<SearchPage>
}

export function createSearcher(getInnertube: () => Promise<Innertube>): Searcher {
  /** For each unfinished search, its last page and its next page, which starts loading as soon as the page is handed out. */
  const pending = new Map<string, { last: SearchFeed; next: Promise<FilledPage> }>()

  async function nextPage(last: SearchFeed): Promise<FilledPage> {
    return fillPage(await last.getContinuation())
  }

  function remember(last: SearchFeed): string | undefined {
    if (!last.has_continuation) return undefined
    const token = randomUUID()
    const next = nextPage(last)
    // A next page that fails is loaded again when it is asked for.
    next.catch(() => undefined)
    pending.set(token, { last, next })
    for (const oldest of pending.keys()) {
      if (pending.size <= REMEMBERED_SEARCHES) break
      pending.delete(oldest)
    }
    return token
  }

  async function run(request: SearchRequest): Promise<FilledPage> {
    if (request.continuation) {
      const previous = pending.get(request.continuation)
      if (!previous) {
        throw new Error('These search results have expired. Search again.')
      }
      pending.delete(request.continuation)
      return previous.next.catch(() => nextPage(previous.last))
    }
    const search: YT.Search = await (await getInnertube()).search(request.query, FILTER_OPTIONS[request.filter])
    return fillPage(search)
  }

  return {
    async search(request) {
      const { results, last } = await run(request)
      return { ...results, continuation: remember(last) }
    }
  }
}
