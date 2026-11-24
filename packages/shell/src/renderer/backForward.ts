/** Going back or forward in a window's history. */
export type Step = 'back' | 'forward'

/** Where a window can go from the page it shows, read from the history entry the router keeps for it. */
export function historySteps(state: unknown): { back: boolean, forward: boolean } {
  if (typeof state !== 'object' || state === null) {
    return { back: false, forward: false }
  }
  const { back, forward } = state as Record<string, unknown>
  return { back: typeof back === 'string', forward: typeof forward === 'string' }
}

/** The place of the shown page in the window's history, counted by the router, or undefined when it is not known. */
export function historyPosition(state: unknown): number | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined
  }
  const { position } = state as Record<string, unknown>
  return typeof position === 'number' && Number.isInteger(position) ? position : undefined
}

/** Alt+Left goes back and Alt+Right goes forward, once per press, with no other modifier held. */
export function keyStep(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'shiftKey' | 'metaKey' | 'repeat'>): Step | undefined {
  if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || event.repeat) {
    return undefined
  }
  return event.key === 'ArrowLeft' ? 'back' : event.key === 'ArrowRight' ? 'forward' : undefined
}

/** The mouse's side buttons: the back button is button 3, the forward button is button 4. */
export function mouseStep(event: Pick<MouseEvent, 'button'>): Step | undefined {
  return event.button === 3 ? 'back' : event.button === 4 ? 'forward' : undefined
}

/** Whether the search box holds something to search for. */
export function canSearch(text: string): boolean {
  return text.trim().length > 0
}

/** How a page was reached: by a step back or forward, by a change of the same history entry, or opened as a new entry. */
export type Arrival = 'step' | 'same' | 'opened'

export function arrival(stepped: boolean, from: number | undefined, to: number | undefined): Arrival {
  if (stepped) {
    return 'step'
  }
  return from !== undefined && from === to ? 'same' : 'opened'
}

/** How far each page of a window's history was scrolled, by its place in the history. */
export interface ScrollMemory {
  /** Remembers how far the page at a place was scrolled. */
  save(position: number | undefined, top: number): void
  /** How far the page at a place was scrolled, 0 when nothing is remembered. */
  saved(position: number | undefined): number
  /** A page opened at a place replaces that place and every later one, so their scroll positions are forgotten. */
  forgetFrom(position: number | undefined): void
}

export function createScrollMemory(): ScrollMemory {
  const tops = new Map<number, number>()
  return {
    save(position, top) {
      if (position !== undefined) {
        tops.set(position, Math.max(0, top))
      }
    },
    saved(position) {
      return position === undefined ? 0 : tops.get(position) ?? 0
    },
    forgetFrom(position) {
      if (position === undefined) {
        return
      }
      for (const key of [...tops.keys()]) {
        if (key >= position) {
          tops.delete(key)
        }
      }
    }
  }
}

/** Where a page being restored scrolls to now: as far toward its remembered place as its content reaches. */
export function restoredTop(wanted: number, scrollHeight: number, clientHeight: number): number {
  return Math.min(wanted, Math.max(0, scrollHeight - clientHeight))
}
