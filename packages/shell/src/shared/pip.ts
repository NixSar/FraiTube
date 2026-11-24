/** Size of the PiP window when it opens, in pixels. */
export const PIP_DEFAULT_SIZE = { width: 400, height: 225 } as const
/** Smallest PiP window, in pixels; it keeps the 16:9 shape of a video. */
export const PIP_MIN_SIZE = { width: 240, height: 135 } as const
/** Space between the PiP window and the screen's edges when it opens, in pixels. */
export const PIP_MARGIN = 16
export const PIP_ASPECT_RATIO = 16 / 9

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

/** Where the PiP window opens: the lower right corner of the screen's work area, smaller on a small screen. */
export function pipBounds(workArea: Area): Area {
  const room = Math.max(PIP_MIN_SIZE.width, Math.min(PIP_DEFAULT_SIZE.width, workArea.width - 2 * PIP_MARGIN))
  const width = Math.round(Math.min(room, (workArea.height - 2 * PIP_MARGIN) * PIP_ASPECT_RATIO))
  const shown = Math.max(PIP_MIN_SIZE.width, width)
  const height = Math.round(shown / PIP_ASPECT_RATIO)
  return {
    x: workArea.x + workArea.width - shown - PIP_MARGIN,
    y: workArea.y + workArea.height - height - PIP_MARGIN,
    width: shown,
    height
  }
}

/**
 * The in-app path of a video's PiP page or watch page, starting at the given second, with the
 * subtitle track to turn on: a track ID, or empty for subtitles off.
 */
function videoPath(page: 'pip' | 'watch', videoId: string, seconds: number, subtitles?: string): string {
  const track = subtitles === undefined ? '' : `&cc=${encodeURIComponent(subtitles)}`
  return `/${page}/${videoId}?t=${Math.max(0, Math.floor(seconds))}${track}`
}

/** The in-app path of the PiP page for a video, starting at the given second, with its subtitles. */
export function pipPath(videoId: string, seconds: number, subtitles?: string): string {
  return videoPath('pip', videoId, seconds, subtitles)
}

/** The in-app path of a video's watch page, starting at the given second, with its subtitles. */
export function watchPath(videoId: string, seconds: number, subtitles?: string): string {
  return videoPath('watch', videoId, seconds, subtitles)
}

/** Longest subtitle track ID accepted from a page or a link. */
export const MAX_SUBTITLE_TRACK_LENGTH = 200

/**
 * The subtitles a moved video carries: a track ID, empty for subtitles off, or undefined when none
 * was passed or the value is not one, and the settings decide.
 */
export function subtitlesFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_SUBTITLE_TRACK_LENGTH ? value : undefined
}

/** What a player gives the player that takes its video over. */
export interface HandOver {
  /** The exact second the video reached. */
  seconds: number
  /** True when the video was paused, so it stays paused in the player that takes over. */
  paused: boolean
}

/** Longest position accepted in a hand-over, in seconds. */
const MAX_HAND_OVER_SECONDS = 1_000_000

export function isHandOver(value: unknown): value is HandOver {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { seconds, paused } = value as Partial<HandOver>
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_HAND_OVER_SECONDS &&
    typeof paused === 'boolean'
}

/**
 * A watch page's query without its start second "t" and subtitle track "cc", or undefined when it
 * has neither. The page reads them once, so its history entry keeps neither.
 */
export function withoutStart<Value>(query: Record<string, Value>): Record<string, Value> | undefined {
  if (!('t' in query) && !('cc' in query)) {
    return undefined
  }
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== 't' && key !== 'cc'))
}

/** The start second from a page's "t" query value, or undefined when there is none. */
export function startSecondsFrom(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,7}$/.test(value)) {
    return undefined
  }
  return Number(value)
}
