import { clearWarning } from '../../components/confirmClear'

/** What clearing the history deletes, for the given number of videos in it. */
export function historyClearWarning(count: number): string {
  return clearWarning(count === 1
    ? 'The 1 video, with its saved position and watched mark, is deleted'
    : `All ${count} videos, with their saved positions and watched marks, are deleted`)
}

/**
 * What the History page says in place of its videos: that nothing was watched, or that the history
 * holds only shorts, which do not show. Empty while it shows videos.
 */
export function historyEmptyText(total: number, shown: number): string {
  if (shown > 0) {
    return ''
  }
  return total > 0 ? 'The history holds only Shorts. They show when Show Shorts is on in Settings.' : 'No videos watched yet.'
}
