/** What the New window button opens: the start page while a video plays here, otherwise this same page. */
export function newWindowPath(routeName: unknown, fullPath: string): string {
  return routeName === 'watch' ? '/' : fullPath
}

/** The New window button's tooltip for the page shown. */
export function newWindowTitle(routeName: unknown): string {
  return routeName === 'watch' ? 'Open a new window at the start page' : 'Open this page in a new window'
}
