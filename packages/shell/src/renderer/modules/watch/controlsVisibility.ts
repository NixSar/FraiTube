/** How long the controls stay after the pointer stops moving over a playing video. */
export const HIDE_CONTROLS_MS = 3000
/** How long the controls of a paused video stay after the pointer leaves the player. */
export const PAUSED_HIDE_MS = 1000

/** What decides when the controls hide. `inUse`: keyboard focus is inside them, or their subtitles menu is open. */
export interface ControlsState {
  paused: boolean
  pointerInside: boolean
  inUse: boolean
}

/**
 * How long until the controls hide: while playing they hide a while after the pointer stops,
 * while paused they stay as long as the pointer is over the player or they are in use, and hide
 * soon after. Undefined means they stay.
 */
export function controlsHideDelay(state: ControlsState): number | undefined {
  if (!state.paused) {
    return HIDE_CONTROLS_MS
  }
  return state.pointerInside || state.inUse ? undefined : PAUSED_HIDE_MS
}

/** The space, in pixels, between the player's lower edge and the subtitles menu's, plus a gap above the menu. */
const SUBTITLES_MENU_CLEARANCE = 56
/** The subtitles menu's least height, in pixels, about two items. */
const SUBTITLES_MENU_MIN_HEIGHT = 64

/** The tallest the subtitles menu gets in a player of the given height, so it scrolls instead of leaving the player. */
export function subtitlesMenuMaxHeight(playerHeight: number): number {
  return Math.max(SUBTITLES_MENU_MIN_HEIGHT, playerHeight - SUBTITLES_MENU_CLEARANCE)
}

/** The menu item the focus moves to from the given one with an arrow key, going round at the ends. */
export function nextMenuIndex(current: number, count: number, step: 1 | -1): number {
  if (count <= 0) {
    return -1
  }
  return current < 0 ? (step === 1 ? 0 : count - 1) : (current + step + count) % count
}

/** The parts of the control bar that come and go with the player's width; the others always show. */
export type ControlPart = 'chapter' | 'quality' | 'time' | 'pip' | 'subtitles'

/** The narrowest player each part shows in, so the bar stays one row: the first to go is the chapter title. */
export const CONTROL_PART_MIN_WIDTH: Record<ControlPart, number> = {
  chapter: 640,
  quality: 480,
  time: 380,
  pip: 240,
  subtitles: 200
}

/** Which parts of the control bar show at this player width. */
export function shownControlParts(width: number): Record<ControlPart, boolean> {
  const shown = {} as Record<ControlPart, boolean>
  for (const part of Object.keys(CONTROL_PART_MIN_WIDTH) as ControlPart[]) {
    shown[part] = width >= CONTROL_PART_MIN_WIDTH[part]
  }
  return shown
}
