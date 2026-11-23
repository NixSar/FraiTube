import { array, dig, picture, text } from './json'
import type { Chapter } from './types'

/** Longest chapter title kept. */
export const MAX_CHAPTER_TITLE_LENGTH = 200

/** Seconds of a time such as "1:02:03" or "4:05", or undefined. */
export function parseTimeText(value: string): number | undefined {
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value.trim())) {
    return undefined
  }
  return value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

/** Chapters from the player bar markers, which carry exact start times. */
function fromPlayerBar(data: unknown): Chapter[] {
  const markers = array(dig(
    data,
    'playerOverlays', 'playerOverlayRenderer', 'decoratedPlayerBarRenderer', 'decoratedPlayerBarRenderer',
    'playerBar', 'multiMarkersPlayerBarRenderer', 'markersMap'
  ))
  const entry = markers.find((marker) => dig(marker, 'key') === 'DESCRIPTION_CHAPTERS') ??
    markers.find((marker) => dig(marker, 'key') === 'AUTO_CHAPTERS')
  return array(dig(entry, 'value', 'chapters')).flatMap((item) => {
    const chapter = dig(item, 'chapterRenderer')
    const startMillis = Number(dig(chapter, 'timeRangeStartMillis'))
    if (!chapter || !Number.isFinite(startMillis)) {
      return []
    }
    return [{ title: text(dig(chapter, 'title')), startSeconds: startMillis / 1000, thumbnail: picture(dig(chapter, 'thumbnail')) }]
  })
}

/** Chapters from the chapter panel, whose start times are whole seconds. */
function fromPanel(data: unknown): Chapter[] {
  const panel = array(dig(data, 'engagementPanels'))
    .map((item) => dig(item, 'engagementPanelSectionListRenderer'))
    .find((item) => {
      const id = dig(item, 'panelIdentifier') ?? dig(item, 'targetId')
      return typeof id === 'string' && id.includes('macro-markers') && id.includes('chapters')
    })
  return array(dig(panel, 'content', 'macroMarkersListRenderer', 'contents')).flatMap((item) => {
    const marker = dig(item, 'macroMarkersListItemRenderer')
    const startSeconds = parseTimeText(text(dig(marker, 'timeDescription')))
    if (!marker || startSeconds === undefined) {
      return []
    }
    return [{ title: text(dig(marker, 'title')), startSeconds, thumbnail: picture(dig(marker, 'thumbnail')) }]
  })
}

/**
 * The chapters of a video from its watch page data (ytInitialData) or a /next response,
 * in order, starting within the video. Empty when the video has none.
 */
export function readChapters(data: unknown, durationSeconds: number): Chapter[] {
  const found = fromPlayerBar(data)
  const chapters = (found.length > 0 ? found : fromPanel(data))
    .filter((chapter) => chapter.startSeconds >= 0 && (durationSeconds <= 0 || chapter.startSeconds < durationSeconds))
    .map((chapter) => ({ ...chapter, title: chapter.title.trim().slice(0, MAX_CHAPTER_TITLE_LENGTH) }))
    .sort((a, b) => a.startSeconds - b.startSeconds)
  return chapters.filter((chapter, index) => index === 0 || chapter.startSeconds > (chapters[index - 1]?.startSeconds ?? -1))
}
