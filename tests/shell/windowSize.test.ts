import { describe, expect, it } from 'vitest'
import { DEFAULT_WINDOW_SIZE, fitWindowSize, MIN_WINDOW_SIZE } from '../../packages/shell/src/main/windowSize'

const screen = { width: 1920, height: 1040 }

describe('window size limits', () => {
  it('lets the window shrink to phone width', () => {
    expect(MIN_WINDOW_SIZE).toEqual({ width: 360, height: 560 })
    expect(DEFAULT_WINDOW_SIZE).toEqual({ width: 1200, height: 800 })
  })
})

describe('fitWindowSize', () => {
  it('keeps a saved size that fits', () => {
    expect(fitWindowSize({ width: 1200, height: 800 }, screen)).toEqual({ width: 1200, height: 800 })
  })

  it('raises a saved size below the minimum to the minimum', () => {
    expect(fitWindowSize({ width: 200, height: 100 }, screen)).toEqual({ width: 360, height: 560 })
  })

  it('shrinks a saved size bigger than the screen to the screen', () => {
    expect(fitWindowSize({ width: 4000, height: 3000 }, screen)).toEqual({ width: 1920, height: 1040 })
  })

  it('keeps the minimum on a screen smaller than the minimum', () => {
    expect(fitWindowSize({ width: 800, height: 800 }, { width: 320, height: 480 })).toEqual({ width: 360, height: 560 })
  })

  it('rounds sizes and treats a broken size as the screen size', () => {
    expect(fitWindowSize({ width: 1000.6, height: Number.NaN }, screen)).toEqual({ width: 1001, height: 1040 })
  })
})
