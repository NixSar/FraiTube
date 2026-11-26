import { isChannelId, normalizeAvatar } from '@fraitube/subscriptions'
import { isVideoId } from '@fraitube/youtube/ids'

/** The history's setting, shown with the player's Playback settings. Resuming is on unless turned off there. */
export const HistorySettingKey = {
  resume: 'history.resume'
} as const

/** What the watch page tells the main process about a video when it starts. */
export interface HistoryVideo {
  videoId: string
  title: string
  /** Empty when YouTube named no channel. */
  channelId: string
  channelName: string
  /** The channel's icon; empty when unknown, and missing in entries saved before icons were kept. */
  channelAvatar?: string
  durationSeconds: number
  /**
   * True for a video opened from a short's card or a Shorts link. Missing for every other video, and in
   * entries saved before the mark was kept, which count as videos.
   */
  short?: boolean
}

export interface HistoryEntry extends HistoryVideo {
  /** When the video was last opened, in milliseconds. */
  watchedAt: number
  /** Where the video stopped, in seconds. 0 for a video watched to its end. */
  positionSeconds: number
  /**
   * True once the video played to its end or was marked as watched, false once marked as unwatched.
   * Only marking it unwatched clears it; its position changes nothing. Missing in entries saved
   * before the mark was kept, which count as watched when played to their end.
   */
  watched?: boolean
}

/** The apps whose watch history can be imported. */
export type HistoryImportFormat = 'freetube' | 'newpipe'

/** What a history import did. */
export interface HistoryImportSummary {
  format: HistoryImportFormat
  /** Videos found in the file. */
  total: number
  /** Videos that were not in the history. */
  added: number
  /** Videos in the history that the file shows were watched later. */
  updated: number
  /** Videos already in the history with the same or a later watch time. */
  alreadyInHistory: number
}

export const MAX_HISTORY_TITLE_LENGTH = 500
export const MAX_HISTORY_CHANNEL_NAME_LENGTH = 200
/** Longest length or position accepted, in seconds. */
export const MAX_HISTORY_SECONDS = 1_000_000

export function isHistorySeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_HISTORY_SECONDS
}

export function isHistoryVideo(value: unknown): value is HistoryVideo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const video = value as Partial<HistoryVideo>
  return isVideoId(video.videoId) &&
    typeof video.title === 'string' && video.title.length <= MAX_HISTORY_TITLE_LENGTH &&
    (video.channelId === '' || isChannelId(video.channelId)) &&
    typeof video.channelName === 'string' && video.channelName.length <= MAX_HISTORY_CHANNEL_NAME_LENGTH &&
    (video.channelAvatar === undefined || video.channelAvatar === '' || normalizeAvatar(video.channelAvatar) === video.channelAvatar) &&
    isHistorySeconds(video.durationSeconds) &&
    (video.short === undefined || typeof video.short === 'boolean')
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isHistoryVideo(value)) {
    return false
  }
  const entry = value as Partial<HistoryEntry>
  return typeof entry.watchedAt === 'number' && isHistorySeconds(entry.positionSeconds)
    && (entry.watched === undefined || typeof entry.watched === 'boolean')
}

/** Where a video starts: its saved position, or the beginning when nothing useful is saved. */
export function resumeSeconds(positionSeconds: number, durationSeconds: number): number {
  if (positionSeconds <= 0 || (durationSeconds > 0 && positionSeconds >= durationSeconds)) {
    return 0
  }
  return positionSeconds
}

/**
 * The position saved for a video: where it is, or its listed length once it has played to its end,
 * so it shows as fully watched; resumeSeconds starts such a video from the beginning. The listed
 * length is the one in the history entry; a stream can end a little short of it.
 */
export function positionToSave(currentSeconds: number, ended: boolean, durationSeconds: number): number {
  if (ended && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.max(currentSeconds, durationSeconds)
  }
  return currentSeconds
}

/** An entry with a newly saved position. A position at the video's end marks it as watched. */
export function withSavedPosition(entry: HistoryEntry, positionSeconds: number): HistoryEntry {
  const atEnd = entry.durationSeconds > 0 && positionSeconds >= entry.durationSeconds
  return { ...entry, positionSeconds, ...(atEnd ? { watched: true } : {}) }
}

/** An entry with a newly saved position, or undefined when there is no entry or the position is the same. */
export function entryWithPosition(entry: HistoryEntry | undefined, positionSeconds: number): HistoryEntry | undefined {
  return entry && entry.positionSeconds !== positionSeconds ? withSavedPosition(entry, positionSeconds) : undefined
}

/** Share of a video, in percent, past which it counts as played. */
export const PLAYED_PERCENT = 1

/** A video counts as played once its saved position is past the given share of its length, 1% unless told otherwise. */
export function isPlayed(entry: Pick<HistoryEntry, 'positionSeconds' | 'durationSeconds'>, minPercent = PLAYED_PERCENT): boolean {
  return entry.durationSeconds > 0 && entry.positionSeconds > (entry.durationSeconds * minPercent) / 100
}

/** Whether a video is watched: its mark, or for an entry saved before the mark was kept, whether it played to its end. */
export function isWatched(entry: Pick<HistoryEntry, 'positionSeconds' | 'durationSeconds' | 'watched'>): boolean {
  return entry.watched ?? (entry.durationSeconds > 0 && entry.positionSeconds >= entry.durationSeconds)
}

/** What a video's menu offers: marking it watched, or once it is watched, marking it unwatched. */
export function watchedAction(entry: HistoryEntry | undefined): 'markWatched' | 'markUnwatched' {
  return entry && isWatched(entry) ? 'markUnwatched' : 'markWatched'
}

/** A time as the player shows it, for example 4:05 or 1:02:03. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

/** How far a played video was watched: the bar's width in percent and a label such as "12:34 / 45:00". */
export interface WatchProgress {
  percent: number
  label: string
}

/**
 * The progress shown on a video's card: the bar always shows the saved position. A watched video is
 * labeled "Watched"; any other shows its position and length, or nothing while it does not count as
 * played. The History page passes 0, so every saved position shows there.
 */
export function watchProgress(entry: Pick<HistoryEntry, 'positionSeconds' | 'durationSeconds' | 'watched'>, minPercent = PLAYED_PERCENT): WatchProgress | undefined {
  if (isWatched(entry)) {
    return { percent: watchedPercent(entry), label: 'Watched' }
  }
  if (!isPlayed(entry, minPercent)) {
    return undefined
  }
  const position = Math.min(entry.positionSeconds, entry.durationSeconds)
  return { percent: watchedPercent(entry), label: `${formatClock(position)} / ${formatClock(entry.durationSeconds)}` }
}

/** A video's picture as YouTube serves it for lists. */
export function videoThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

/** Videos shown under Continue watching in the side column. */
export const CONTINUE_WATCHING_COUNT = 10

/**
 * The videos in progress: not watched, played past 1% and not to their end, last watched first.
 */
export function continueWatching(entries: Iterable<HistoryEntry>, count = CONTINUE_WATCHING_COUNT): HistoryEntry[] {
  return [...entries]
    .filter((entry) => !isWatched(entry) && isPlayed(entry) && resumeSeconds(entry.positionSeconds, entry.durationSeconds) > 0)
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, count)
}

/** The time left in a video, for example "40 min left" or "1 h 5 min left". */
export function timeLeftText(entry: Pick<HistoryEntry, 'positionSeconds' | 'durationSeconds'>): string {
  const minutes = Math.max(1, Math.ceil((entry.durationSeconds - entry.positionSeconds) / 60))
  if (minutes < 60) {
    return `${minutes} min left`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} h ${rest} min left` : `${hours} h left`
}

/** How much of a video was watched, in percent. */
export function watchedPercent(entry: Pick<HistoryEntry, 'positionSeconds' | 'durationSeconds'>): number {
  if (entry.durationSeconds <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (entry.positionSeconds / entry.durationSeconds) * 100))
}
