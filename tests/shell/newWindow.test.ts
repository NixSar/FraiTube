import { describe, expect, it } from 'vitest'
import { newWindowPath, newWindowTitle } from '../../packages/shell/src/renderer/newWindow'

describe('the New window button', () => {
  it('opens the start page from a video page', () => {
    expect(newWindowPath('watch', '/watch/dQw4w9WgXcQ?t=42')).toBe('/')
    expect(newWindowTitle('watch')).toBe('Open a new window at the start page')
  })

  it('opens the same page from any other page', () => {
    expect(newWindowPath('search', '/search?q=synth')).toBe('/search?q=synth')
    expect(newWindowPath('subscriptions', '/subscriptions')).toBe('/subscriptions')
    expect(newWindowTitle('search')).toBe('Open this page in a new window')
  })
})
