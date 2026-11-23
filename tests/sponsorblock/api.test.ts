import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SERVER, hashPrefix, isServerUrl, parseSegments, segmentsUrl } from '../../packages/sponsorblock/src/api'

const VIDEO = 'l8qxFcaLSM4'

describe('hashPrefix', () => {
  it('sends only the first 4 hex characters of the SHA-256 hash', async () => {
    const full = createHash('sha256').update(VIDEO).digest('hex')
    const prefix = await hashPrefix(VIDEO)
    expect(prefix).toBe(full.slice(0, 4))
    expect(prefix).toMatch(/^[0-9a-f]{4}$/)
  })
})

describe('segmentsUrl', () => {
  it('asks for the hash prefix, the chosen categories and every action type, and never the video ID', () => {
    const url = new URL(segmentsUrl(DEFAULT_SERVER, 'ab12', ['sponsor', 'poi_highlight']))
    expect(url.origin).toBe('https://sponsor.ajay.app')
    expect(url.pathname).toBe('/api/skipSegments/ab12')
    expect(JSON.parse(url.searchParams.get('categories') ?? '')).toEqual(['sponsor', 'poi_highlight'])
    expect(JSON.parse(url.searchParams.get('actionTypes') ?? '')).toEqual(['skip', 'mute', 'poi'])
    expect(url.toString()).not.toContain(VIDEO)
  })
})

describe('isServerUrl', () => {
  it('accepts a plain https address only', () => {
    expect(isServerUrl('https://sponsor.ajay.app')).toBe(true)
    expect(isServerUrl('https://sponsor.example.org/')).toBe(true)
    expect(isServerUrl('http://sponsor.ajay.app')).toBe(false)
    expect(isServerUrl('https://user:pass@sponsor.ajay.app')).toBe(false)
    expect(isServerUrl('https://sponsor.ajay.app/api')).toBe(false)
    expect(isServerUrl('https://sponsor.ajay.app/?a=1')).toBe(false)
    expect(isServerUrl('not a url')).toBe(false)
    expect(isServerUrl(5)).toBe(false)
  })
})

describe('parseSegments', () => {
  const answer = [
    {
      videoID: 'otherVideo1',
      segments: [{ UUID: 'other', category: 'sponsor', actionType: 'skip', segment: [1, 2] }]
    },
    {
      videoID: VIDEO,
      segments: [
        { UUID: 'b', category: 'selfpromo', actionType: 'skip', segment: [900, 930.5] },
        { UUID: 'a', category: 'sponsor', actionType: 'skip', segment: [63.2, 121.75] },
        { UUID: 'h', category: 'poi_highlight', actionType: 'poi', segment: [400, 400] },
        { UUID: 'm', category: 'music_offtopic', actionType: 'mute', segment: [10, 20] },
        { UUID: 'bad1', category: 'unknown', actionType: 'skip', segment: [1, 2] },
        { UUID: 'bad2', category: 'sponsor', actionType: 'skip', segment: [5, 4] },
        { UUID: 'bad3', category: 'sponsor', actionType: 'skip', segment: [5, 5] },
        { UUID: 'bad4', category: 'sponsor', actionType: 'poi', segment: [5, 5] },
        { UUID: 'bad5', category: 'sponsor', actionType: 'skip', segment: ['5', 6] },
        { category: 'sponsor', actionType: 'skip', segment: [1, 2] }
      ]
    }
  ]

  it('keeps the valid segments of the asked video, by start time', () => {
    expect(parseSegments(answer, VIDEO)).toEqual([
      { uuid: 'm', category: 'music_offtopic', actionType: 'mute', start: 10, end: 20 },
      { uuid: 'a', category: 'sponsor', actionType: 'skip', start: 63.2, end: 121.75 },
      { uuid: 'h', category: 'poi_highlight', actionType: 'poi', start: 400, end: 400 },
      { uuid: 'b', category: 'selfpromo', actionType: 'skip', start: 900, end: 930.5 }
    ])
  })

  it('finds nothing for a video without an entry or for an answer that is not a list', () => {
    expect(parseSegments(answer, 'missingVid1')).toEqual([])
    expect(parseSegments({ error: true }, VIDEO)).toEqual([])
    expect(parseSegments(null, VIDEO)).toEqual([])
  })
})
