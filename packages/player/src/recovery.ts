/** The longest wait between two tries to reconnect a stopped video. */
export const RECONNECT_MAX_WAIT_MS = 30_000
/** After this long without trouble, reconnecting starts again with no wait. */
export const RECONNECT_CALM_MS = 60_000

/**
 * How long to wait before a try to reconnect, counted from 0: the first try goes at once, then the
 * waits grow 1, 2, 4, 8 and 16 seconds, and stay at 30 seconds for as long as the video is open.
 */
export function reconnectWaitMs(attempt: number): number {
  if (attempt <= 0) {
    return 0
  }
  return Math.min(RECONNECT_MAX_WAIT_MS, 1000 * 2 ** (attempt - 1))
}
