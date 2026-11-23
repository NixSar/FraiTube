/**
 * Follows the waits a SABR server asks for between requests. A new stream of the same video
 * waits out what the previous one still owed, and repeated waits count as a loop.
 */

/** Back-off requests in one stream after which it is treated as stuck and reloaded. */
export const BACKOFF_LOOP_LIMIT = 3

export interface BackoffTracker {
  /** Milliseconds a new stream must still wait before its first request. */
  remainingMs(): number
  /** Records a request made right after the stream honoured the given back-off. Returns true once it is a loop. */
  onRequest(backoffMs: number): boolean
  /** Records the back-off a stream still owed when it was stopped. */
  onStop(backoffMs: number): void
}

export function createBackoffTracker(now: () => number = Date.now): BackoffTracker {
  let untilMs = 0
  let inARow = 0
  return {
    remainingMs() {
      return Math.max(0, untilMs - now())
    },
    onRequest(backoffMs) {
      if (backoffMs > 0) {
        inARow += 1
      } else {
        inARow = 0
      }
      return inARow >= BACKOFF_LOOP_LIMIT
    },
    onStop(backoffMs) {
      if (backoffMs > 0) {
        untilMs = Math.max(untilMs, now() + backoffMs)
      }
    }
  }
}

/** Waits the given time, or less when the signal aborts first. */
export function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
