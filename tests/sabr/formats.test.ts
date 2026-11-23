import { describe, expect, it } from 'vitest'
import type { SabrFormat } from '../../packages/sabr/src/index'
import { pickAudioFormat, pickVideoFormat } from '../../packages/sabr/src/formats'

function format(fields: Partial<SabrFormat>): SabrFormat {
  return {
    itag: 0,
    lastModified: '0',
    bitrate: 1000,
    approxDurationMs: 1000,
    isHdr: false,
    hasAudio: false,
    hasVideo: false,
    hasText: false,
    codecCode: '',
    ...fields
  }
}

const vp9 = (itag: number, height: number, extra: Partial<SabrFormat> = {}): SabrFormat =>
  format({ itag, height, hasVideo: true, mimeType: 'video/webm; codecs="vp9"', ...extra })

const everything = { isSupported: () => true }

describe('pickVideoFormat', () => {
  it('picks the tallest playable SDR format within the limit', () => {
    const formats = [vp9(1, 720), vp9(2, 1080), vp9(3, 2160), vp9(4, 1080, { isHdr: true })]
    expect(pickVideoFormat(formats, { maxHeight: 1080, ...everything })?.itag).toBe(2)
  })

  it('prefers VP9 over AV1 at the same height and frame rate', () => {
    const av1 = format({ itag: 5, height: 1080, hasVideo: true, mimeType: 'video/mp4; codecs="av01.0.08M.08"', bitrate: 9000 })
    expect(pickVideoFormat([av1, vp9(6, 1080)], { maxHeight: 1080, ...everything })?.itag).toBe(6)
  })

  it('skips formats the engine cannot play', () => {
    const avc = format({ itag: 7, height: 720, hasVideo: true, mimeType: 'video/mp4; codecs="avc1.4d401f"' })
    const onlyMp4 = { maxHeight: 1080, isSupported: (mime: string) => mime.startsWith('video/mp4') }
    expect(pickVideoFormat([vp9(8, 1080), avc], onlyMp4)?.itag).toBe(7)
  })
})

describe('pickAudioFormat', () => {
  it('prefers original, uncompressed opus with the highest bitrate', () => {
    const formats = [
      format({ itag: 1, hasAudio: true, mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, isDrc: true }),
      format({ itag: 2, hasAudio: true, mimeType: 'audio/webm; codecs="opus"', bitrate: 130000 }),
      format({ itag: 3, hasAudio: true, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 130000 }),
      format({ itag: 4, hasAudio: true, mimeType: 'audio/webm; codecs="opus"', bitrate: 200000, audioTrackId: 'de.3', isOriginal: false })
    ]
    expect(pickAudioFormat(formats, everything)?.itag).toBe(2)
  })
})
