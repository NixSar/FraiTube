/** One subtitle line or block, with times in seconds. */
export interface Cue {
  start: number
  end: number
  text: string
}

export interface CaptionTrackInfo {
  language: string
  auto: boolean
}

/** The text of every cue showing at the given time, in start order, one per line. */
export function activeCueText(cues: readonly Cue[], time: number): string {
  return cues
    .filter((cue) => cue.start <= time && time < cue.end)
    .map((cue) => cue.text)
    .join('\n')
}

/** Lines auto-generated subtitles show at once, as on youtube.com. */
export const ROLLING_LINES = 2

/**
 * Auto-generated subtitles arrive as overlapping lines. This makes them roll: each line leaves
 * when the line after the next one starts, so at most `lines` lines show at once.
 */
export function rollCues<T extends Cue>(cues: readonly T[], lines: number = ROLLING_LINES): T[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  return sorted.map((cue, index) => {
    const replacedBy = sorted[index + lines]
    return replacedBy && replacedBy.start < cue.end ? { ...cue, end: replacedBy.start } : cue
  })
}

/**
 * The newest rows of subtitle text, at most `rows` of them. Some auto-generated tracks send each step
 * as a block of two rows, so two blocks showing at once would otherwise make four rows.
 */
export function newestRows(text: string, rows: number = ROLLING_LINES): string {
  return text.split('\n').filter((row) => row.trim() !== '').slice(-rows).join('\n')
}

/**
 * The rectangle the picture fills inside its box when scaled to fit without cropping,
 * with letterbox or pillarbox bars around it.
 */
export function shownVideoRect(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number): {
  left: number
  top: number
  width: number
  height: number
} {
  if (videoWidth <= 0 || videoHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { left: 0, top: 0, width: boxWidth, height: boxHeight }
  }
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height }
}

/** Smallest subtitle text, in pixels, so tiny windows stay readable. */
export const MIN_SUBTITLE_PX = 10

/** Subtitle text size in pixels, as a share in percent of the shown video height. */
export function subtitleFontPx(shownHeight: number, sizePercent: number): number {
  return Math.max(MIN_SUBTITLE_PX, (shownHeight * sizePercent) / 100)
}

/** Fonts subtitles can use, found on every Windows and Linux system. */
export const SUBTITLE_FONTS = {
  sans: 'system-ui, sans-serif',
  serif: 'serif',
  monospace: 'monospace'
} as const

/** How subtitles look, as chosen in Settings. */
export interface SubtitleLook {
  /** Gap between the subtitles and the bottom of the picture, in percent of its height. */
  positionPercent: number
  /** A key of SUBTITLE_FONTS. */
  font: string
  /** Text size, in percent of the picture height. */
  sizePercent: number
  /** Text color, as #rrggbb. */
  color: string
  /** Color of the box behind the text, as #rrggbb. */
  background: string
  /** Opacity of the box behind the text, in percent. 0 shows no box. */
  backgroundOpacity: number
}

const HEX_COLOR = /^#([0-9a-f]{6})$/i

/** The CSS color of the box behind the text: the background color at the chosen opacity. */
export function subtitleBackground(color: string, opacityPercent: number): string {
  const value = Number.parseInt(HEX_COLOR.exec(color)?.[1] ?? '000000', 16)
  const opacity = Math.min(100, Math.max(0, opacityPercent))
  return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${opacity}%)`
}

/** Pixel sizes and CSS values for subtitles over a picture shown this many pixels high. */
export function subtitleLayout(look: SubtitleLook, shownHeight: number): {
  gapPx: number
  fontPx: number
  fontFamily: string
  color: string
  background: string
} {
  const fonts: Record<string, string> = SUBTITLE_FONTS
  return {
    gapPx: (shownHeight * Math.min(100, Math.max(0, look.positionPercent))) / 100,
    fontPx: subtitleFontPx(shownHeight, look.sizePercent),
    fontFamily: fonts[look.font] ?? SUBTITLE_FONTS.sans,
    color: HEX_COLOR.test(look.color) ? look.color : '#ffffff',
    background: subtitleBackground(look.background, look.backgroundOpacity)
  }
}

/**
 * Picks a track for the preferred language: written subtitles first, then auto-generated ones.
 * A preference like "en" also matches regional tracks like "en-GB".
 */
export function pickCaptionTrack<T extends CaptionTrackInfo>(tracks: readonly T[], language: string): T | undefined {
  const wanted = language.trim().toLowerCase()
  if (!wanted) {
    return undefined
  }
  const matches = (track: T): boolean => {
    const code = track.language.toLowerCase()
    return code === wanted || code.startsWith(`${wanted}-`)
  }
  return tracks.find((track) => !track.auto && matches(track)) ?? tracks.find((track) => track.auto && matches(track))
}
