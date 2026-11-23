import type { FeedVideo } from './types'

/** Every video once, newest first. */
export function mergeFeeds(lists: Iterable<readonly FeedVideo[]>): FeedVideo[] {
  const byId = new Map<string, FeedVideo>()
  for (const list of lists) {
    for (const video of list) {
      if (!byId.has(video.id)) {
        byId.set(video.id, video)
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt)
}

/** Runs the task for every item, at most `limit` at a time, and keeps the results in item order. */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const UNITS: [string, number][] = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000]
]

/** How long ago a time was, for example "3 hours ago". */
export function timeAgo(time: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - time)
  for (const [unit, size] of UNITS) {
    const count = Math.floor(elapsed / size)
    if (count >= 1) {
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`
    }
  }
  return 'just now'
}
