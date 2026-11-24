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
  channels: { type: 'channel' }
}
/** How many unfinished searches keep their next page available. */
const REMEMBERED_SEARCHES = 50

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

/** Splits YouTube's search result items into videos and channels, skipping everything else. */
export function toResults(nodes: readonly YTNode[]): Pick<SearchPage, 'videos' | 'channels'> {
  const videos: VideoResult[] = []
  const channels: ChannelResult[] = []
  for (const node of nodes) {
    if (node.is(YTNodes.Video)) {
      videos.push(toVideo(node))
    } else if (node.is(YTNodes.Channel)) {
      channels.push(toChannel(node))
    }
  }
  return { videos, channels }
}

/** Parses raw search result items, as YouTube sends them, into videos and channels. */
export function parseRawResults(items: unknown[]): Pick<SearchPage, 'videos' | 'channels'> {
  return toResults(Parser.parseArray(items as Parameters<typeof Parser.parseArray>[0]))
}

export interface Searcher {
  search(request: SearchRequest): Promise<SearchPage>
}

export function createSearcher(getInnertube: () => Promise<Innertube>): Searcher {
  const pending = new Map<string, YT.Search>()

  function remember(search: YT.Search): string | undefined {
    if (!search.has_continuation) return undefined
    const token = randomUUID()
    pending.set(token, search)
    for (const oldest of pending.keys()) {
      if (pending.size <= REMEMBERED_SEARCHES) break
      pending.delete(oldest)
    }
    return token
  }

  async function run(filter: SearchFilter, request: SearchRequest): Promise<YT.Search> {
    if (request.continuation) {
      const previous = pending.get(request.continuation)
      if (!previous) {
        throw new Error('These search results have expired. Search again.')
      }
      pending.delete(request.continuation)
      return previous.getContinuation()
    }
    return (await getInnertube()).search(request.query, FILTER_OPTIONS[filter])
  }

  return {
    async search(request) {
      const search = await run(request.filter, request)
      return { ...toResults(search.results), continuation: remember(search) }
    }
  }
}
