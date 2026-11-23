/**
 * True when a navigation stays on the page a window already shows: the same address, whatever the
 * in-app path after "#". A window never navigates anywhere else, such as to a file dropped on it.
 */
export function staysOnPage(target: string, current: string): boolean {
  try {
    const to = new URL(target)
    const from = new URL(current)
    to.hash = ''
    from.hash = ''
    return to.href === from.href
  } catch {
    return false
  }
}
