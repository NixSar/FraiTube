import { ref, shallowRef } from 'vue'
import { videoDetailsOf, type VideoDetails, type VideoPlayback } from '@fraitube/youtube/types'
import type { HandOver } from '../../../shared/pip'

/** What the watch page and the frame need from the player. */
export interface PlayerControls {
  seekTo(seconds: number): void
  pause(): void
  /** True while the video plays, or is about to carry on after loading. */
  isPlaying(): boolean
  readonly currentTime: number
  /** The exact second the video is at. */
  playheadSeconds(): number
  /** Starts a video that waited to take over, at the given second when there is one; a paused one stays paused there. */
  takeOver(seconds?: number, paused?: boolean): void
  /** The subtitle track showing, or empty while subtitles are off. */
  subtitleTrackId(): string
}

/** The video of this window's watch page. */
export const playback = shallowRef<VideoPlayback>()
/** What the watch page shows about its video, known before the video can play. */
export const details = shallowRef<VideoDetails>()
export const loadingVideo = ref(false)
export const playbackError = ref('')
/** Where the video starts, when it does not start at its saved position. */
export const startSeconds = ref<number>()
/** The subtitle track a video brought back from the PiP window starts with, empty for off. */
export const startSubtitles = ref<string>()
/** The place on the open watch page where the player goes. */
export const pageSlot = shallowRef<HTMLElement>()
/** The player, while one is shown. */
export const controls = shallowRef<PlayerControls>()
/** True while the video plays on out of sight, after leaving its watch page, until the PiP window takes over. */
export const handingOff = ref(false)
/** True while the next video shown waits, buffered, to take over from the PiP window. */
export const takingOver = ref(false)
/** A video handed to the PiP window stops here after this long, even when the PiP window never took over. */
export const HAND_OFF_LIMIT_MS = 15_000

/** The video coming back from the PiP window, until its watch page opens it. */
let returningVideoId: string | undefined

/**
 * The PiP window takes over, or closed before it did: a video kept out of sight stops and gives the
 * second it reached and whether it was paused.
 */
export function handOverNow(): HandOver | undefined {
  const player = controls.value
  if (!handingOff.value || !player) {
    return undefined
  }
  const given = { seconds: player.playheadSeconds(), paused: !player.isPlaying() }
  closeVideo()
  return given
}

/**
 * The PiP window's Back button: the query its video's watch page opens with. The video loads there
 * at the given second with its subtitle track, empty for off, and takes over from the PiP window
 * once buffered. A video still playing here, not yet taken over, carries on where it is.
 */
export function returnFromPip(videoId: string, seconds: number, subtitles: string | undefined): { t?: string; cc?: string } {
  if (playback.value?.videoId === videoId) {
    return {}
  }
  takingOver.value = true
  returningVideoId = videoId
  return { t: String(Math.floor(seconds)), ...(subtitles === undefined ? {} : { cc: subtitles }) }
}

let handOffTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Hands the video to the PiP window: it plays on here, out of sight, while the PiP window loads it
 * with its subtitle track, and stops once the PiP window takes over at the second it reached, or
 * after HAND_OFF_LIMIT_MS. False when no video is shown.
 */
export function handOffToPip(): boolean {
  const video = playback.value
  const player = controls.value
  if (!video || !player) {
    return false
  }
  handingOff.value = true
  window.fraitube.openPip(video.videoId, player.playheadSeconds(), player.subtitleTrackId())
  clearTimeout(handOffTimer)
  handOffTimer = setTimeout(() => {
    if (handingOff.value) {
      closeVideo()
    }
  }, HAND_OFF_LIMIT_MS)
  return true
}

let loadId = 0

/** The video whose details show, read afresh, since they may have arrived while its playback loaded. */
function shownDetailsId(): string | undefined {
  return details.value?.videoId
}

/** Leaving the watch page: a playing video goes into the PiP window, any other video closes. */
export function placeAfterLeaving(playing: boolean): 'pip' | 'closed' {
  return playing ? 'pip' : 'closed'
}

/**
 * Shows a video on the watch page, from the given second or else its saved position, and closes
 * the PiP window. Its details show as soon as they are known, while the video is still loading.
 * The video already shown stays when it is the same one, moving to the given
 * second, and is replaced, saving its position, when it is another. A video coming back from the
 * PiP window brings its subtitle track, empty for off, and the PiP window stays open, playing on,
 * until this video takes over.
 */
export async function openVideo(videoId: string, start?: number, subtitles?: string): Promise<void> {
  const comingBack = takingOver.value && returningVideoId === videoId
  returningVideoId = undefined
  if (!comingBack) {
    takingOver.value = false
    window.fraitube.closePip()
  }
  handingOff.value = false
  if (playback.value?.videoId === videoId) {
    if (start !== undefined) {
      controls.value?.seekTo(start)
    }
    return
  }
  const id = ++loadId
  playback.value = undefined
  details.value = undefined
  startSeconds.value = start
  startSubtitles.value = subtitles
  playbackError.value = ''
  loadingVideo.value = true
  window.fraitube.getVideoDetails(videoId).then((found) => {
    if (id === loadId && !details.value) {
      details.value = found
    }
  }, () => {
    // The playback that follows shows the details, or why the video could not be loaded.
  })
  try {
    const result = await window.fraitube.getPlayback(videoId)
    if (id === loadId) {
      playback.value = result
      if (shownDetailsId() !== videoId) {
        details.value = videoDetailsOf(result)
      }
    }
  } catch (cause) {
    if (id === loadId) {
      playbackError.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (id === loadId) {
      loadingVideo.value = false
    }
  }
}

/**
 * Whether the window can go back after its video moves to PiP: there is a page before, and it is
 * not another watch page, since opening a video there would close the PiP window again.
 */
export function canGoBackFromPip(back: unknown, routeName: (path: string) => unknown): boolean {
  return typeof back === 'string' && routeName(back) !== 'watch'
}

/** Stops and closes the video; the player saves its position as it closes. */
export function closeVideo(): void {
  loadId++
  clearTimeout(handOffTimer)
  handingOff.value = false
  takingOver.value = false
  returningVideoId = undefined
  playback.value = undefined
  details.value = undefined
  startSeconds.value = undefined
  startSubtitles.value = undefined
  loadingVideo.value = false
  playbackError.value = ''
}
