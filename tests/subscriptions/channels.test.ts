import { describe, expect, it } from 'vitest'
import { isChannel, isChannelId, normalizeAvatar, toChannel, uniqueChannels } from '../../packages/subscriptions/src/channels'
import { GAMERS_NEXUS } from './fixtures'

describe('normalizeAvatar', () => {
  it('keeps yt3.ggpht.com pictures and moves yt3.googleusercontent.com ones there', () => {
    expect(normalizeAvatar('https://yt3.ggpht.com/a=s88')).toBe('https://yt3.ggpht.com/a=s88')
    expect(normalizeAvatar('https://yt3.googleusercontent.com/a=s88')).toBe('https://yt3.ggpht.com/a=s88')
    expect(normalizeAvatar('//yt3.ggpht.com/a=s88')).toBe('https://yt3.ggpht.com/a=s88')
  })

  it('drops other hosts, plain http and junk', () => {
    expect(normalizeAvatar('https://evil.example/a.png')).toBe('')
    expect(normalizeAvatar('http://yt3.ggpht.com/a')).toBe('')
    expect(normalizeAvatar('https://user@yt3.ggpht.com/a')).toBe('')
    expect(normalizeAvatar('not a url')).toBe('')
    expect(normalizeAvatar(42)).toBe('')
  })
})

describe('channel checks', () => {
  it('accepts channel IDs only', () => {
    expect(isChannelId(GAMERS_NEXUS)).toBe(true)
    expect(isChannelId('UC123')).toBe(false)
    expect(isChannelId('@gamersnexus')).toBe(false)
  })

  it('builds channels from untrusted data', () => {
    expect(toChannel(GAMERS_NEXUS, '  Gamers Nexus ', 'https://evil.example/a.png')).toEqual({ id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' })
    expect(toChannel(GAMERS_NEXUS, '', '')?.name).toBe(GAMERS_NEXUS)
    expect(toChannel('bad', 'Name', '')).toBeUndefined()
  })

  it('checks channels sent by a page', () => {
    expect(isChannel({ id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' })).toBe(true)
    expect(isChannel({ id: GAMERS_NEXUS, name: '', avatar: '' })).toBe(false)
    expect(isChannel({ id: GAMERS_NEXUS, name: 'x', avatar: 'https://evil.example/a.png' })).toBe(false)
    expect(isChannel({ id: GAMERS_NEXUS, name: 'x'.repeat(201), avatar: '' })).toBe(false)
  })

  it('keeps the first channel with each ID', () => {
    const first = { id: GAMERS_NEXUS, name: 'First', avatar: '' }
    expect(uniqueChannels([first, { ...first, name: 'Second' }])).toEqual([first])
  })
})
