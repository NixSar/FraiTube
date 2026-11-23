import { describe, expect, it } from 'vitest'
import {
  activeCueText,
  MIN_SUBTITLE_PX,
  newestRows,
  pickCaptionTrack,
  rollCues,
  shownVideoRect,
  subtitleBackground,
  subtitleFontPx,
  subtitleLayout
} from '../../packages/player/src/subtitles'

describe('subtitleLayout', () => {
  const look = { positionPercent: 3, font: 'sans', sizePercent: 5, color: '#ffffff', background: '#000000', backgroundOpacity: 75 }

  it('places and styles subtitles as chosen, sized to the shown picture', () => {
    expect(subtitleLayout(look, 1000)).toEqual({
      gapPx: 30,
      fontPx: 50,
      fontFamily: 'system-ui, sans-serif',
      color: '#ffffff',
      background: 'rgb(0 0 0 / 75%)'
    })
    expect(subtitleLayout({ ...look, positionPercent: 20, font: 'serif', color: '#ffff00', background: '#203040', backgroundOpacity: 50 }, 500))
      .toEqual({ gapPx: 100, fontPx: 25, fontFamily: 'serif', color: '#ffff00', background: 'rgb(32 48 64 / 50%)' })
  })

  it('falls back to the defaults for an unknown font or a bad color', () => {
    const layout = subtitleLayout({ ...look, font: 'comic', color: 'red' }, 1000)
    expect(layout.fontFamily).toBe('system-ui, sans-serif')
    expect(layout.color).toBe('#ffffff')
  })
})

describe('subtitleBackground', () => {
  it('shows no box at 0% and keeps the opacity between 0 and 100', () => {
    expect(subtitleBackground('#000000', 0)).toBe('rgb(0 0 0 / 0%)')
    expect(subtitleBackground('#ffffff', 150)).toBe('rgb(255 255 255 / 100%)')
    expect(subtitleBackground('bad', 75)).toBe('rgb(0 0 0 / 75%)')
  })
})

describe('newestRows', () => {
  it('keeps two rows of a track that sends one row at a time', () => {
    const cues = rollCues([
      { start: 0, end: 9, text: 'one' },
      { start: 1, end: 9, text: 'two' },
      { start: 2, end: 9, text: 'three' }
    ])
    expect(newestRows(activeCueText(cues, 1.5))).toBe('one\ntwo')
    expect(newestRows(activeCueText(cues, 2.5))).toBe('two\nthree')
  })

  it('shows only the newest block of a track that sends two-row blocks', () => {
    const cues = rollCues([
      { start: 0, end: 9, text: 'because uncovering these differences\ncould lead to more personalized and' },
      { start: 4, end: 9, text: 'precise ways to prevent, detect, and\ntreat the disease.' }
    ])
    expect(newestRows(activeCueText(cues, 5))).toBe('precise ways to prevent, detect, and\ntreat the disease.')
  })

  it('leaves short text and empty rows alone', () => {
    expect(newestRows('only')).toBe('only')
    expect(newestRows('')).toBe('')
    expect(newestRows('a\n\nb\n')).toBe('a\nb')
  })
})

describe('activeCueText', () => {
  const cues = [
    { start: 1, end: 3, text: 'first' },
    { start: 2, end: 4, text: 'second' },
    { start: 5, end: 6, text: 'third' }
  ]

  it('joins every cue showing at the time', () => {
    expect(activeCueText(cues, 2.5)).toBe('first\nsecond')
  })

  it('treats the end time as already gone', () => {
    expect(activeCueText(cues, 3)).toBe('second')
    expect(activeCueText(cues, 4.5)).toBe('')
  })
})

describe('rollCues', () => {
  // Auto-generated lines as YouTube sends them: each one lasts until well after the next two start.
  const lines = [
    { start: 0, end: 6, text: 'one' },
    { start: 2, end: 8, text: 'two' },
    { start: 4, end: 10, text: 'three' },
    { start: 6, end: 12, text: 'four' }
  ]

  it('shows at most two lines at any time', () => {
    const rolled = rollCues(lines)
    for (let time = 0; time < 12; time += 0.25) {
      expect(activeCueText(rolled, time).split('\n').length).toBeLessThanOrEqual(2)
    }
    expect(activeCueText(rolled, 4.5)).toBe('two\nthree')
    expect(activeCueText(rolled, 6.5)).toBe('three\nfour')
  })

  it('lets each line leave when the line after the next one starts', () => {
    expect(rollCues(lines).map((cue) => cue.end)).toEqual([4, 6, 10, 12])
  })

  it('leaves lines alone that end before they would be replaced', () => {
    const short = [{ start: 0, end: 1, text: 'a' }, { start: 2, end: 3, text: 'b' }, { start: 4, end: 5, text: 'c' }]
    expect(rollCues(short)).toEqual(short)
  })

  it('sorts lines by start time', () => {
    expect(rollCues([{ start: 5, end: 6, text: 'late' }, { start: 1, end: 2, text: 'early' }]).map((cue) => cue.text)).toEqual(['early', 'late'])
  })
})

describe('shownVideoRect', () => {
  it('adds bars above and below a wide picture', () => {
    const rect = shownVideoRect(1600, 900, 1920, 800)
    expect(rect.left).toBe(0)
    expect(rect.width).toBe(1600)
    expect(rect.height).toBeCloseTo(666.667, 2)
    expect(rect.top).toBeCloseTo(116.667, 2)
  })

  it('adds bars at the sides of a tall picture', () => {
    expect(shownVideoRect(1600, 900, 1080, 1920)).toEqual({ left: 546.875, top: 0, width: 506.25, height: 900 })
  })

  it('fills the box while the picture size is unknown', () => {
    expect(shownVideoRect(640, 360, 0, 0)).toEqual({ left: 0, top: 0, width: 640, height: 360 })
  })
})

describe('subtitleFontPx', () => {
  it('scales with the shown picture height', () => {
    expect(subtitleFontPx(1000, 5)).toBe(50)
  })

  it('never goes below the smallest readable size', () => {
    expect(subtitleFontPx(100, 5)).toBe(MIN_SUBTITLE_PX)
  })
})

describe('pickCaptionTrack', () => {
  const tracks = [
    { id: 'a.en', language: 'en', auto: true },
    { id: '.en-GB', language: 'en-GB', auto: false },
    { id: '.de', language: 'de', auto: false }
  ]

  it('prefers written subtitles over generated ones, regional ones included', () => {
    expect(pickCaptionTrack(tracks, 'en')?.id).toBe('.en-GB')
  })

  it('falls back to generated subtitles', () => {
    expect(pickCaptionTrack([{ id: 'a.fr', language: 'fr', auto: true }], 'FR')?.id).toBe('a.fr')
  })

  it('finds nothing for a missing or empty language', () => {
    expect(pickCaptionTrack(tracks, 'es')).toBeUndefined()
    expect(pickCaptionTrack(tracks, ' ')).toBeUndefined()
  })

  it('does not take a language that only starts with the same letters', () => {
    expect(pickCaptionTrack([{ id: '.de', language: 'de', auto: false }], 'd')).toBeUndefined()
  })
})
