import { describe, expect, it } from 'vitest'
import {
  CONTROL_PART_MIN_WIDTH,
  controlsHideDelay,
  HIDE_CONTROLS_MS,
  PAUSED_HIDE_MS,
  shownControlParts,
  type ControlPart
} from '../../packages/shell/src/renderer/modules/watch/controlsVisibility'
import { ICONS, isIconName } from '../../packages/shell/src/renderer/components/icons'
import { NAV_ORDER } from '../../packages/shell/src/renderer/sideNav'

describe('controls hiding', () => {
  it('hides a playing video\'s controls a while after the pointer stops, wherever it is', () => {
    expect(controlsHideDelay({ paused: false, pointerInside: true })).toBe(HIDE_CONTROLS_MS)
    expect(controlsHideDelay({ paused: false, pointerInside: false })).toBe(HIDE_CONTROLS_MS)
  })

  it('keeps a paused video\'s controls while the pointer is over the player', () => {
    expect(controlsHideDelay({ paused: true, pointerInside: true })).toBeUndefined()
  })

  it('hides a paused video\'s controls 1 second after the pointer is away', () => {
    expect(PAUSED_HIDE_MS).toBe(1000)
    expect(controlsHideDelay({ paused: true, pointerInside: false })).toBe(PAUSED_HIDE_MS)
  })
})

describe('control bar parts', () => {
  /** The parts left out as the player narrows, first to last. */
  function droppingOrder(): ControlPart[] {
    const dropped: ControlPart[] = []
    for (let width = 1200; width >= 0; width--) {
      const shown = shownControlParts(width)
      for (const part of Object.keys(shown) as ControlPart[]) {
        if (!shown[part] && !dropped.includes(part)) {
          dropped.push(part)
        }
      }
    }
    return dropped
  }

  it('shows every part in a wide player', () => {
    expect(Object.values(shownControlParts(1200)).every(Boolean)).toBe(true)
  })

  it('leaves out the chapter title, quality, time, PiP and subtitles in that order', () => {
    expect(droppingOrder()).toEqual(['chapter', 'quality', 'time', 'pip', 'subtitles'])
  })

  it('shows a part from exactly its narrowest width', () => {
    for (const [part, width] of Object.entries(CONTROL_PART_MIN_WIDTH) as [ControlPart, number][]) {
      expect(shownControlParts(width)[part]).toBe(true)
      expect(shownControlParts(width - 1)[part]).toBe(false)
    }
  })
})

describe('icons', () => {
  it('has an icon for every side column link', () => {
    for (const route of Object.keys(NAV_ORDER)) {
      expect(isIconName(route)).toBe(true)
    }
  })

  it('has every player icon', () => {
    for (const name of ['play', 'pause', 'volume', 'mute', 'subtitles', 'fullscreen', 'exitFullscreen', 'pip']) {
      expect(isIconName(name)).toBe(true)
    }
    expect(isIconName('missing')).toBe(false)
    expect(isIconName('toString')).toBe(false)
  })

  it('draws every icon with at least one path', () => {
    for (const paths of Object.values(ICONS)) {
      expect(paths.length).toBeGreaterThan(0)
      for (const path of paths) {
        expect(path.d).toMatch(/^M/)
      }
    }
  })
})
