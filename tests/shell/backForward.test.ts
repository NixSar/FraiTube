import { describe, expect, it } from 'vitest'
import {
  arrival,
  canSearch,
  createScrollMemory,
  historyPosition,
  historySteps,
  keyStep,
  mouseStep,
  restoredTop
} from '../../packages/shell/src/renderer/backForward'

const keys = { altKey: true, ctrlKey: false, shiftKey: false, metaKey: false, repeat: false }

describe('back and forward', () => {
  it('can go back and forward only where the history has a page', () => {
    expect(historySteps({ back: '/subscriptions', current: '/search?q=synth', forward: null })).toEqual({ back: true, forward: false })
    expect(historySteps({ back: null, current: '/subscriptions', forward: '/search?q=synth' })).toEqual({ back: false, forward: true })
    expect(historySteps({ back: '/a', current: '/b', forward: '/c' })).toEqual({ back: true, forward: true })
  })

  it('goes nowhere in a window that has just opened', () => {
    expect(historySteps(null)).toEqual({ back: false, forward: false })
    expect(historySteps({ back: null, current: '/subscriptions', forward: null })).toEqual({ back: false, forward: false })
  })

  it('goes back with Alt+Left and forward with Alt+Right', () => {
    expect(keyStep({ ...keys, key: 'ArrowLeft' })).toBe('back')
    expect(keyStep({ ...keys, key: 'ArrowRight' })).toBe('forward')
  })

  it('leaves the arrow keys alone without Alt or with another modifier', () => {
    expect(keyStep({ ...keys, altKey: false, key: 'ArrowLeft' })).toBeUndefined()
    expect(keyStep({ ...keys, ctrlKey: true, key: 'ArrowLeft' })).toBeUndefined()
    expect(keyStep({ ...keys, shiftKey: true, key: 'ArrowRight' })).toBeUndefined()
    expect(keyStep({ ...keys, key: 'ArrowUp' })).toBeUndefined()
  })

  it('acts once per press, ignoring the repeats of held keys', () => {
    expect(keyStep({ ...keys, repeat: true, key: 'ArrowLeft' })).toBeUndefined()
    expect(keyStep({ ...keys, repeat: true, key: 'ArrowRight' })).toBeUndefined()
  })

  it('goes back and forward with the mouse side buttons', () => {
    expect(mouseStep({ button: 3 })).toBe('back')
    expect(mouseStep({ button: 4 })).toBe('forward')
    expect(mouseStep({ button: 0 })).toBeUndefined()
    expect(mouseStep({ button: 1 })).toBeUndefined()
  })
})

describe('the search button', () => {
  it('searches only when the box holds something', () => {
    expect(canSearch('synth')).toBe(true)
    expect(canSearch('')).toBe(false)
    expect(canSearch('   ')).toBe(false)
  })
})

describe('the scroll position of each history entry', () => {
  it('reads the place of a page in the history', () => {
    expect(historyPosition({ back: null, current: '/subscriptions', position: 3 })).toBe(3)
    expect(historyPosition(null)).toBeUndefined()
    expect(historyPosition({ position: '3' })).toBeUndefined()
  })

  it('tells a step from a changed entry and from a newly opened page', () => {
    expect(arrival(true, 2, 1)).toBe('step')
    expect(arrival(true, 1, 2)).toBe('step')
    expect(arrival(false, 2, 2)).toBe('same')
    expect(arrival(false, 1, 2)).toBe('opened')
    expect(arrival(false, undefined, 0)).toBe('opened')
  })

  it('remembers how far each page was scrolled', () => {
    const memory = createScrollMemory()
    memory.save(1, 800)
    memory.save(2, 1500)
    expect(memory.saved(1)).toBe(800)
    expect(memory.saved(2)).toBe(1500)
    expect(memory.saved(3)).toBe(0)
    expect(memory.saved(undefined)).toBe(0)
  })

  it('forgets a place and every later one when a page opens there', () => {
    const memory = createScrollMemory()
    memory.save(1, 800)
    memory.save(2, 1500)
    memory.save(3, 400)
    memory.forgetFrom(2)
    expect(memory.saved(1)).toBe(800)
    expect(memory.saved(2)).toBe(0)
    expect(memory.saved(3)).toBe(0)
  })

  it('scrolls as far toward the remembered place as the content reaches', () => {
    expect(restoredTop(1500, 3000, 700)).toBe(1500)
    expect(restoredTop(1500, 1200, 700)).toBe(500)
    expect(restoredTop(1500, 600, 700)).toBe(0)
  })
})
