import { nextTick } from 'vue'
import type { Router } from 'vue-router'
import { arrival, createScrollMemory, historyPosition, restoredTop } from './backForward'

/** How long a page reached by a step back or forward is followed while its content loads, in milliseconds. */
const RESTORE_LIMIT_MS = 10_000

/** How often a page being restored is looked at again, in milliseconds. */
const RESTORE_INTERVAL_MS = 100

/** What the user does to take over the scrolling of a page being restored. */
const TAKE_OVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/**
 * Remembers how far each page of the window's history is scrolled. A page reached by a step back or
 * forward returns to its place as its content loads, and a page opened as a new entry starts at the
 * top. Returns the function that stops it.
 */
export function rememberScroll(router: Router, content: () => HTMLElement | null | undefined): () => void {
  const memory = createScrollMemory()
  let position = historyPosition(window.history.state)
  let stepped = false
  let stopRestoring = (): void => undefined

  // The router's history tells of a step back or forward before the router acts on it.
  const stopListening = router.options.history.listen(() => {
    stepped = true
  })

  /**
   * Scrolls toward the remembered place as the page's content grows, until it is reached or the user
   * scrolls. The content grows as its items arrive and as their pictures load, so it is looked at
   * again at short intervals.
   */
  function restore(element: HTMLElement, wanted: number): void {
    const stop = (): void => {
      clearInterval(following)
      clearTimeout(timer)
      for (const name of TAKE_OVER_EVENTS) {
        window.removeEventListener(name, stop, true)
      }
      stopRestoring = (): void => undefined
    }
    const apply = (): void => {
      element.scrollTop = restoredTop(wanted, element.scrollHeight, element.clientHeight)
      if (element.scrollTop >= wanted - 1) {
        stop()
      }
    }
    const following = setInterval(apply, RESTORE_INTERVAL_MS)
    const timer = setTimeout(stop, RESTORE_LIMIT_MS)
    for (const name of TAKE_OVER_EVENTS) {
      window.addEventListener(name, stop, { capture: true, passive: true })
    }
    stopRestoring = stop
    apply()
  }

  const removeBefore = router.beforeEach(() => {
    stopRestoring()
    const element = content()
    if (element) {
      memory.save(position, element.scrollTop)
    }
  })

  const removeAfter = router.afterEach((_to, _from, failure) => {
    const next = historyPosition(window.history.state)
    const how = arrival(stepped, position, next)
    stepped = false
    position = next
    if (failure || how === 'same') {
      return
    }
    if (how === 'opened') {
      memory.forgetFrom(next)
    }
    const wanted = how === 'step' ? memory.saved(next) : 0
    // The page shows on the next tick; until then the page being left is still there.
    void nextTick(() => {
      const element = content()
      if (!element || historyPosition(window.history.state) !== next) {
        return
      }
      if (wanted > 0) {
        restore(element, wanted)
      } else {
        element.scrollTop = 0
      }
    })
  })

  return () => {
    stopRestoring()
    removeBefore()
    removeAfter()
    stopListening()
  }
}
