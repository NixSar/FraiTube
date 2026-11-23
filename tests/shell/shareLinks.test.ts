import { describe, expect, it } from 'vitest'
import { embedLink, watchLink } from '../../packages/shell/src/renderer/modules/watch/shareLinks'

describe('watchLink', () => {
  it('links to the video on YouTube', () => {
    expect(watchLink('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('starts at the whole second given', () => {
    expect(watchLink('dQw4w9WgXcQ', 1309.8)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1309s')
  })

  it('starts at the beginning for a second under one or no real second', () => {
    expect(watchLink('dQw4w9WgXcQ', 0.4)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(watchLink('dQw4w9WgXcQ', Number.NaN)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('embedLink', () => {
  it('links to the embedded player without YouTube cookies', () => {
    expect(embedLink('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('starts at the whole second given', () => {
    expect(embedLink('dQw4w9WgXcQ', 75.2)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=75')
  })

  it('starts at the beginning for a second under one', () => {
    expect(embedLink('dQw4w9WgXcQ', 0)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })
})
