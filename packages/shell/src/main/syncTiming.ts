/** Longest a sync may hold up quitting, so a hung rclone cannot keep the app open. */
export const QUIT_SYNC_LIMIT_MS = 30_000

/** Resolves once the work is done or has failed, or once the limit has passed, whichever comes first. */
export function finishWithin(work: Promise<unknown>, limitMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, limitMs)
    const done = (): void => {
      clearTimeout(timer)
      resolve()
    }
    work.then(done, done)
  })
}

/** The sync before quitting: none while sync is off, else one sync, done or not after 30 seconds. */
export function syncBeforeQuit(syncOn: boolean, run: () => Promise<unknown>): Promise<void> {
  return syncOn ? finishWithin(run(), QUIT_SYNC_LIMIT_MS) : Promise.resolve()
}

/** Starts the first sync once the search for rclone is done, whatever it found, so the sync uses what it found. */
export function afterSearch(search: Promise<unknown>, start: () => void): Promise<void> {
  return search.then(start, start)
}
