import { describe, expect, it } from 'vitest'
import type { SabrFormat } from '../../packages/sabr/src/index'
import { listQualities, qualityHeight } from '../../packages/sabr/src/formats'

function video(itag: number, fields: Partial<SabrFormat>): SabrFormat {
  return {
    itag,
    lastModified: '0',
    bitrate: 1000,
    approxDurationMs: 1000,
    isHdr: false,
    hasAudio: false,
    hasVideo: true,
    hasText: false,
    codecCode: '',
    mimeType: 'video/webm; codecs="vp9"',
    ...fields
  }
}

describe('qualityHeight', () => {
  it('reads the number in the quality name', () => {
    // A wide video: 1080p by name, but only 800 pixels tall.
    expect(qualityHeight(video(1, { height: 800, qualityLabel: '1080p' }))).toBe(1080)
    expect(qualityHeight(video(2, { height: 720, qualityLabel: '720p60' }))).toBe(720)
  })

  it('falls back to the pixel height', () => {
    expect(qualityHeight(video(1, { height: 480 }))).toBe(480)
  })
})

describe('listQualities', () => {
  it('lists each playable height once, highest first, with high frame rates in the name', () => {
    const formats = [
      video(1, { height: 720, qualityLabel: '720p' }),
      video(2, { height: 1080, qualityLabel: '1080p60', fps: 60 }),
      video(3, { height: 1080, qualityLabel: '1080p', fps: 30 }),
      video(4, { height: 2160, qualityLabel: '2160p', isHdr: true }),
      video(5, { height: 1440, qualityLabel: '1440p', mimeType: 'video/mp4; codecs="av01"' })
    ]
    const vp9Only = (mimeType: string): boolean => mimeType.includes('vp9')
    expect(listQualities(formats, vp9Only)).toEqual([
      { height: 1080, label: '1080p60' },
      { height: 720, label: '720p' }
    ])
  })
})
