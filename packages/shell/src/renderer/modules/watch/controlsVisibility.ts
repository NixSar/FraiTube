/** How long the controls stay after the pointer stops moving over a playing video. */
export const HIDE_CONTROLS_MS = 3000
/** How long the controls of a paused video stay after the pointer leaves the player. */
export const PAUSED_HIDE_MS = 1000

/**
 * How long until the controls hide: while playing they hide a while after the pointer stops,
 * while paused they stay as long as the pointer is over the player and hide soon after it leaves.
 * Undefined means they stay.
 */
export function controlsHideDelay(state: { paused: boolean; pointerInside: boolean }): number | undefined {
  if (!state.paused) {
    return HIDE_CONTROLS_MS
  }
  return state.pointerInside ? undefined : PAUSED_HIDE_MS
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
