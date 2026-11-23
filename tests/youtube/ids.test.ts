import { describe, expect, it } from 'vitest'
import { isVideoId, parseVideoId, videoIdFromLink } from '../../packages/youtube/src/ids'

describe('parseVideoId', () => {
  it('accepts bare IDs and common link forms', () => {
    expect(parseVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId(' https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10 ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('rejects everything else', () => {
    expect(parseVideoId('')).toBeUndefined()
    expect(parseVideoId('short')).toBeUndefined()
    expect(parseVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined()
    expect(parseVideoId('https://www.youtube.com/watch?v=bad')).toBeUndefined()
    expect(parseVideoId('https://www.youtube.com/channel/UC123')).toBeUndefined()
  })
})

describe('isVideoId', () => {
  it('checks type and shape', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true)
    expect(isVideoId('dQw4w9WgXc')).toBe(false)
    expect(isVideoId(42)).toBe(false)
  })
})

describe('videoIdFromLink', () => {
  it('opens video links', () => {
    expect(videoIdFromLink('https://www.youtube.com/watch?v=l8qxFcaLSM4&t=30')).toBe('l8qxFcaLSM4')
    expect(videoIdFromLink('  https://youtu.be/l8qxFcaLSM4  ')).toBe('l8qxFcaLSM4')
  })

  it('searches anything else, including an eleven-letter word', () => {
    expect(videoIdFromLink('linuxgaming')).toBeUndefined()
    expect(videoIdFromLink('hardware news')).toBeUndefined()
    expect(videoIdFromLink('https://example.com/watch?v=l8qxFcaLSM4')).toBeUndefined()
  })
})
