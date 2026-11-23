import { describe, expect, it } from 'vitest'
import { startingSubtitleTrack } from '../../packages/shell/src/renderer/modules/watch/subtitleStart'

const tracks = [
  { id: '.en', language: 'en', auto: false },
  { id: 'a.de', language: 'de', auto: true }
]

describe('startingSubtitleTrack', () => {
  it('turns on the track a moved video brings', () => {
    expect(startingSubtitleTrack('a.de', tracks, false, 'en')).toBe('a.de')
    expect(startingSubtitleTrack('a.de', tracks, true, 'en')).toBe('a.de')
  })

  it('keeps subtitles off when the moved video had them off, whatever the settings say', () => {
    expect(startingSubtitleTrack('', tracks, true, 'en')).toBeUndefined()
  })

  it('follows the settings when no track came along, or one the video does not have', () => {
    expect(startingSubtitleTrack(undefined, tracks, true, 'en')).toBe('.en')
    expect(startingSubtitleTrack(undefined, tracks, false, 'en')).toBeUndefined()
    expect(startingSubtitleTrack('.fr', tracks, true, 'de')).toBe('a.de')
    expect(startingSubtitleTrack('.fr', tracks, false, 'de')).toBeUndefined()
  })
})
