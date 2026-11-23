/** Seconds buffered past the start before a player waiting to take over a video says it is ready. */
export const HAND_OVER_BUFFER_SECONDS = 3
/** A player waiting to take over says it is ready after this long even without that much buffered. */
export const HAND_OVER_WAIT_MS = 10_000

/** True once a waiting player has enough buffered past its start, or up to the end of the video. */
export function bufferedForHandOver(bufferedEnd: number, from: number, durationSeconds: number): boolean {
  return bufferedEnd >= from + HAND_OVER_BUFFER_SECONDS || (durationSeconds > 0 && bufferedEnd >= durationSeconds - 0.5)
}
