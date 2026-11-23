/** The word typed to allow clearing a whole list, such as the history or the subscriptions. */
export const CLEAR_WORD = 'CLEAR'

/** Whether the typed text allows clearing: the word exactly, in capitals, spaces around it ignored. */
export function confirmsClear(typed: string): boolean {
  return typed.trim() === CLEAR_WORD
}

/** The warning for clearing, from what is lost, for example "All 3 channels are unsubscribed". */
export function clearWarning(lost: string): string {
  return `${lost} here and, through sync, on your other computers. This cannot be undone, except by restoring a backup.`
}