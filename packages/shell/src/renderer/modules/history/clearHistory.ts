import { clearWarning } from '../../components/confirmClear'

/** What clearing the history deletes, for the given number of videos in it. */
export function historyClearWarning(count: number): string {
  return clearWarning(count === 1
    ? 'The 1 video, with its saved position and watched mark, is deleted'
    : `All ${count} videos, with their saved positions and watched marks, are deleted`)
}
