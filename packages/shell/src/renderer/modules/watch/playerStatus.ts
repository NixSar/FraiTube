import { formatClock } from '../../../shared/history'

/** Shown while a video's details are fetched, before the player starts. */
export const VIDEO_DETAILS_STATUS = 'Getting video details'

export interface PlayerState {
  /** True while a stopped video reconnects. */
  reconnecting: boolean
  /** The quality being switched to, such as "1080p", or empty. */
  switchingTo: string
  /** Where the video starts, until its first picture shows. */
  startingAt: number | undefined
  /** True while playback waits for data. */
  buffering: boolean
}

/** What the player is doing, in a few words, or empty while it simply plays. */
export function playerStatusText(state: PlayerState): string {
  if (state.reconnecting) {
    return 'Reconnecting'
  }
  if (state.switchingTo) {
    return `Switching to ${state.switchingTo}`
  }
  if (state.startingAt !== undefined) {
    return state.startingAt >= 1 ? `Starting at ${formatClock(state.startingAt)}` : 'Starting video'
  }
  return state.buffering ? 'Buffering' : ''
}
