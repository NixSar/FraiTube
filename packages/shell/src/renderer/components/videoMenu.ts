/** One item of a video's menu. */
export interface VideoMenuItem {
  label: string
  run: () => void
}

/** The watch page of a video; a short's page marks it as a short. */
export function watchPath(videoId: string, short = false): string {
  return `/watch/${videoId}${short ? '?short=1' : ''}`
}

/** The item that opens a video's watch page in a new app window, as Ctrl+click on its link does. */
export function playInNewWindowItem(
  videoId: string,
  short = false,
  openWindow: (path: string) => void = (path) => window.fraitube.openWindow(path)
): VideoMenuItem {
  return { label: 'Play in new window', run: () => openWindow(watchPath(videoId, short)) }
}

/** Width of a video's menu, in pixels, used to keep it inside the window. */
export const VIDEO_MENU_WIDTH = 230
/** Height of one menu item, in pixels, used to keep the menu inside the window. */
export const VIDEO_MENU_ITEM_HEIGHT = 32
/** The menu's padding and border above and below its items, in pixels. */
const VIDEO_MENU_FRAME_HEIGHT = 10

/** Where a menu with the given number of items shows for a point, moved left or up to stay inside the window. */
export function videoMenuPosition(
  point: { x: number; y: number },
  itemCount: number,
  windowSize: { width: number; height: number }
): { left: number; top: number } {
  const height = itemCount * VIDEO_MENU_ITEM_HEIGHT + VIDEO_MENU_FRAME_HEIGHT
  return {
    left: Math.max(0, Math.min(point.x, windowSize.width - VIDEO_MENU_WIDTH)),
    top: Math.max(0, Math.min(point.y, windowSize.height - height))
  }
}
