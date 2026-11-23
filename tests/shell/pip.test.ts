import { describe, expect, it } from 'vitest'
import { isHandOver, PIP_DEFAULT_SIZE, PIP_MIN_SIZE, pipBounds, pipPath, startSecondsFrom, subtitlesFrom, watchPath } from '../../packages/shell/src/shared/pip'

describe('pipBounds', () => {
  it('opens 400 by 225 in the lower right corner, 16 pixels from the edges', () => {
    expect(PIP_DEFAULT_SIZE).toEqual({ width: 400, height: 225 })
    expect(pipBounds({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({ x: 1504, y: 799, width: 400, height: 225 })
  })

  it('follows a screen that does not start at 0', () => {
    expect(pipBounds({ x: 1920, y: 100, width: 1280, height: 984 })).toEqual({ x: 2784, y: 843, width: 400, height: 225 })
  })

  it('is smaller on a small screen, but never below the smallest size', () => {
    expect(pipBounds({ x: 0, y: 0, width: 360, height: 640 })).toMatchObject({ width: 328, height: 185 })
    expect(PIP_MIN_SIZE).toEqual({ width: 240, height: 135 })
    expect(pipBounds({ x: 0, y: 0, width: 200, height: 100 })).toMatchObject({ width: 240, height: 135 })
  })
})

describe('pip paths and start seconds', () => {
  it('opens the PiP page at a whole second', () => {
    expect(pipPath('l8qxFcaLSM4', 347.9)).toBe('/pip/l8qxFcaLSM4?t=347')
    expect(pipPath('l8qxFcaLSM4', -2)).toBe('/pip/l8qxFcaLSM4?t=0')
  })

  it('carries the subtitle track to the PiP page and back to the watch page', () => {
    expect(pipPath('l8qxFcaLSM4', 347.9, 'a.en')).toBe('/pip/l8qxFcaLSM4?t=347&cc=a.en')
    expect(pipPath('l8qxFcaLSM4', 10, '')).toBe('/pip/l8qxFcaLSM4?t=10&cc=')
    expect(watchPath('l8qxFcaLSM4', 120.4, '.de&x')).toBe('/watch/l8qxFcaLSM4?t=120&cc=.de%26x')
    expect(watchPath('l8qxFcaLSM4', 120)).toBe('/watch/l8qxFcaLSM4?t=120')
  })

  it('reads a subtitle track, empty for off, and nothing from anything else', () => {
    expect(subtitlesFrom('a.en')).toBe('a.en')
    expect(subtitlesFrom('')).toBe('')
    expect(subtitlesFrom(undefined)).toBeUndefined()
    expect(subtitlesFrom(['a.en'])).toBeUndefined()
    expect(subtitlesFrom('x'.repeat(201))).toBeUndefined()
  })

  it('accepts a hand-over only with a real second and whether the video was paused', () => {
    expect(isHandOver({ seconds: 347.141, paused: false })).toBe(true)
    expect(isHandOver({ seconds: 0, paused: true })).toBe(true)
    expect(isHandOver({ seconds: 347 })).toBe(false)
    expect(isHandOver({ seconds: -1, paused: false })).toBe(false)
    expect(isHandOver({ seconds: Number.NaN, paused: false })).toBe(false)
    expect(isHandOver({ seconds: 10, paused: 'no' })).toBe(false)
    expect(isHandOver(347)).toBe(false)
    expect(isHandOver(undefined)).toBe(false)
  })

  it('reads the start second only from plain whole numbers', () => {
    expect(startSecondsFrom('347')).toBe(347)
    expect(startSecondsFrom('0')).toBe(0)
    expect(startSecondsFrom(undefined)).toBeUndefined()
    expect(startSecondsFrom('-1')).toBeUndefined()
    expect(startSecondsFrom('1e3')).toBeUndefined()
    expect(startSecondsFrom(['3'])).toBeUndefined()
  })
})
