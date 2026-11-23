import { describe, expect, it } from 'vitest'
import { isMutedAt, MIN_SKIP_SECONDS, segmentToSkip, visibleSegments, type CategoryModes } from '../../packages/sponsorblock/src/skip'
import type { Segment } from '../../packages/sponsorblock/src/types'

const sponsor: Segment = { uuid: 'a', category: 'sponsor', actionType: 'skip', start: 63.2, end: 121.75 }
const intro: Segment = { uuid: 'b', category: 'intro', actionType: 'skip', start: 0, end: 8 }
const outro: Segment = { uuid: 'c', category: 'outro', actionType: 'skip', start: 2000, end: 2205 }
const music: Segment = { uuid: 'm', category: 'music_offtopic', actionType: 'mute', start: 10, end: 20 }
const highlight: Segment = { uuid: 'h', category: 'poi_highlight', actionType: 'poi', start: 400, end: 400 }
const segments = [intro, music, sponsor, highlight, outro]
const modes: CategoryModes = { sponsor: 'skip', intro: 'show', outro: 'off', music_offtopic: 'skip' }

describe('segmentToSkip', () => {
  it('skips a Skip segment the time is inside', () => {
    expect(segmentToSkip(segments, 63.2, modes, new Set())).toBe(sponsor)
    expect(segmentToSkip(segments, 100, modes, new Set())).toBe(sponsor)
  })

  it('leaves segments shown only, turned off, undone, or just skipped', () => {
    expect(segmentToSkip(segments, 4, modes, new Set())).toBeUndefined()
    expect(segmentToSkip(segments, 2100, modes, new Set())).toBeUndefined()
    expect(segmentToSkip(segments, 100, modes, new Set(['a']))).toBeUndefined()
    expect(segmentToSkip(segments, sponsor.end, modes, new Set())).toBeUndefined()
    expect(segmentToSkip(segments, sponsor.end - MIN_SKIP_SECONDS / 2, modes, new Set())).toBeUndefined()
    expect(segmentToSkip(segments, 63.1, modes, new Set())).toBeUndefined()
  })

  it('never skips mute segments or highlights', () => {
    expect(segmentToSkip(segments, 15, modes, new Set())).toBeUndefined()
    expect(segmentToSkip(segments, 400, modes, new Set())).toBeUndefined()
  })

  it('treats a category without a choice as off', () => {
    expect(segmentToSkip(segments, 100, {}, new Set())).toBeUndefined()
  })
})

describe('isMutedAt', () => {
  it('mutes inside a mute segment of a Skip category only', () => {
    expect(isMutedAt(segments, 10, modes)).toBe(true)
    expect(isMutedAt(segments, 19.99, modes)).toBe(true)
    expect(isMutedAt(segments, 20, modes)).toBe(false)
    expect(isMutedAt(segments, 15, { ...modes, music_offtopic: 'show' })).toBe(false)
  })
})

describe('visibleSegments', () => {
  it('shows every category that is not off, and always the highlight', () => {
    expect(visibleSegments(segments, modes)).toEqual([intro, music, sponsor, highlight])
  })
})
