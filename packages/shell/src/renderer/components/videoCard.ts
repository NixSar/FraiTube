/** Smallest width of a video card in the grid, in pixels; the grid fits as many columns as this allows. */
export const MIN_CARD_WIDTH = 240

/** The middle dot, with a space on each side, that separates the parts of a line of details. */
export const DETAIL_SEPARATOR = ` ${String.fromCodePoint(0xB7)} `

/** The line under a card's channel, from its non-empty parts. */
export function cardDetails(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(DETAIL_SEPARATOR)
}

/** The text in the corner of a card's thumbnail: LIVE for a live video, otherwise its length. */
export function cardBadge(video: { isLive?: boolean; durationText?: string }): string {
  return video.isLive ? 'LIVE' : video.durationText ?? ''
}
