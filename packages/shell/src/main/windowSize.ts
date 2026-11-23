/** Smallest window, in pixels: about the width of a phone screen. */
export const MIN_WINDOW_SIZE = { width: 360, height: 560 } as const

/** Size of a window when no size is saved yet. */
export const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 } as const

export interface Size {
  width: number
  height: number
}

/** A saved window size kept within the minimum size and the screen's work area. */
export function fitWindowSize(saved: Size, workArea: Size): Size {
  const fit = (value: number, min: number, max: number): number => {
    const whole = Number.isFinite(value) ? Math.round(value) : max
    return Math.max(min, Math.min(whole, Math.max(min, max)))
  }
  return {
    width: fit(saved.width, MIN_WINDOW_SIZE.width, workArea.width),
    height: fit(saved.height, MIN_WINDOW_SIZE.height, workArea.height)
  }
}
