import { array, dig, picture, text } from './json'
import type { DescriptionPart, VideoAbout } from './types'

const YOUTUBE_ORIGIN = 'https://www.youtube.com'

/** The first item of the watch results that has the given renderer. */
function resultsItem(data: unknown, renderer: string): unknown {
  const contents = array(dig(data, 'contents', 'twoColumnWatchNextResults', 'results', 'results', 'contents'))
  return dig(contents.find((item) => dig(item, renderer) !== undefined), renderer)
}

/** The items of the expanded description panel. */
function panelItems(data: unknown): unknown[] {
  const panel = array(dig(data, 'engagementPanels'))
    .map((item) => dig(item, 'engagementPanelSectionListRenderer'))
    .find((item) => dig(item, 'panelIdentifier') === 'engagement-panel-structured-description')
  return array(dig(panel, 'content', 'structuredDescriptionContentRenderer', 'items'))
}

function panelItem(data: unknown, renderer: string): unknown {
  return dig(panelItems(data).find((item) => dig(item, renderer) !== undefined), renderer)
}

function likesText(primary: unknown, header: unknown): string {
  for (const button of array(dig(primary, 'videoActions', 'menuRenderer', 'topLevelButtons'))) {
    const model = dig(button, 'segmentedLikeDislikeButtonViewModel')
    const count = dig(model, 'likeCountEntity', 'likeCountIfIndifferent', 'content')
    if (typeof count === 'string' && count) {
      return count
    }
  }
  const factoid = array(dig(header, 'factoid'))
    .map((item) => dig(item, 'factoidRenderer'))
    .find((item) => text(dig(item, 'label')) === 'Likes')
  return text(dig(factoid, 'value'))
}

/** Where a description link leads, with YouTube's redirect page taken out; only web links are kept. */
function linkUrl(command: unknown): string | undefined {
  const raw = dig(command, 'urlEndpoint', 'url') ?? dig(command, 'commandMetadata', 'webCommandMetadata', 'url')
  if (typeof raw !== 'string') {
    return undefined
  }
  try {
    let url = new URL(raw, YOUTUBE_ORIGIN)
    if (url.origin === YOUTUBE_ORIGIN && url.pathname === '/redirect') {
      url = new URL(url.searchParams.get('q') ?? '')
    }
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Splits YouTube's attributed text, such as a description or comment, into text, links and times in this video. */
export function readAttributedText(description: unknown, videoId: string): DescriptionPart[] {
  const content = dig(description, 'content')
  if (typeof content !== 'string') {
    return []
  }
  const runs = array(dig(description, 'commandRuns'))
    .map((run) => ({ start: Number(dig(run, 'startIndex')), length: Number(dig(run, 'length')), command: dig(run, 'onTap', 'innertubeCommand') }))
    .filter((run) => Number.isInteger(run.start) && Number.isInteger(run.length) && run.start >= 0 && run.length > 0)
    .sort((a, b) => a.start - b.start)

  const parts: DescriptionPart[] = []
  const addText = (value: string): void => {
    const last = parts.at(-1)
    if (last?.kind === 'text') {
      last.text += value
    } else if (value) {
      parts.push({ kind: 'text', text: value })
    }
  }

  let position = 0
  for (const run of runs) {
    const end = run.start + run.length
    if (run.start < position || end > content.length) {
      continue
    }
    addText(content.slice(position, run.start))
    const value = content.slice(run.start, end)
    const watch = dig(run.command, 'watchEndpoint')
    const url = linkUrl(run.command)
    if (watch !== undefined && dig(watch, 'videoId') === videoId) {
      parts.push({ kind: 'time', text: value, seconds: Math.max(0, Number(dig(watch, 'startTimeSeconds') ?? 0) || 0) })
    } else if (url) {
      parts.push({ kind: 'link', text: value, url })
    } else {
      addText(value)
    }
    position = end
  }
  addText(content.slice(position))
  return parts
}

/** What the watch page shows under the video, from its watch page data (ytInitialData) or a /next response. */
export function readAbout(data: unknown, videoId: string): VideoAbout {
  const primary = resultsItem(data, 'videoPrimaryInfoRenderer')
  const secondary = resultsItem(data, 'videoSecondaryInfoRenderer')
  const owner = dig(secondary, 'owner', 'videoOwnerRenderer')
  const header = panelItem(data, 'videoDescriptionHeaderRenderer')
  const views = dig(primary, 'viewCount', 'videoViewCountRenderer')

  const exactViewsText = text(dig(views, 'viewCount')) || text(dig(header, 'views'))
  const extraShort = text(dig(views, 'extraShortViewCount'))
  const live = dig(views, 'isLive') === true
  const viewsText = text(dig(views, 'shortViewCount')) || (extraShort && !live ? `${extraShort} views` : exactViewsText)

  const description = dig(secondary, 'attributedDescription') ??
    dig(panelItem(data, 'expandableVideoDescriptionBodyRenderer'), 'attributedDescriptionBodyText')

  return {
    channelIcon: picture(dig(owner, 'thumbnail')) || picture(dig(header, 'channelThumbnail')),
    subscribersText: text(dig(owner, 'subscriberCountText')),
    viewsText,
    exactViewsText,
    relativeDateText: text(dig(primary, 'relativeDateText')),
    publishDateText: text(dig(primary, 'dateText')) || text(dig(header, 'publishDate')),
    likesText: likesText(primary, header),
    description: readAttributedText(description, videoId)
  }
}
