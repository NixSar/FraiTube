import { describe, expect, it } from 'vitest'
import { CAPTIONS_FAILED, captionUrl, loadCaptions, parseJson3, readCaptionTracks } from '../../packages/youtube/src/captions'

describe('readCaptionTracks', () => {
  const raw = [
    {
      baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&xosf=1&fmt=srv3',
      name: { simpleText: 'English' },
      languageCode: 'en',
      vssId: '.en'
    },
    {
      baseUrl: '/api/timedtext?v=abc&lang=de&kind=asr',
      name: { runs: [{ text: 'German ' }, { text: '(auto-generated)' }] },
      languageCode: 'de',
      kind: 'asr'
    },
    { baseUrl: 'https://evil.example/api/timedtext', languageCode: 'fr' },
    { languageCode: 'es' }
  ]

  it('keeps YouTube tracks only and names them', () => {
    const tracks = readCaptionTracks(raw, 'WEB')
    expect(tracks.map(({ id, label, language, auto }) => ({ id, label, language, auto }))).toEqual([
      { id: '.en', label: 'English', language: 'en', auto: false },
      { id: 'track1', label: 'German (auto-generated)', language: 'de', auto: true }
    ])
  })

  it('asks for JSON without the corner placement, and leaves the token for request time', () => {
    const [english] = readCaptionTracks(raw, 'WEB')
    const url = new URL(english?.url ?? '')
    expect(url.hostname).toBe('www.youtube.com')
    expect(url.searchParams.get('fmt')).toBe('json3')
    expect(url.searchParams.get('c')).toBe('WEB')
    expect(url.searchParams.has('xosf')).toBe(false)
    expect(url.searchParams.has('pot')).toBe(false)
  })
})

describe('captionUrl', () => {
  it('adds the proof of origin token', () => {
    const url = new URL(captionUrl('https://www.youtube.com/api/timedtext?v=abc&fmt=json3', 'TOKEN'))
    expect(url.searchParams.get('pot')).toBe('TOKEN')
    expect(url.searchParams.get('potc')).toBe('1')
    expect(url.searchParams.get('v')).toBe('abc')
  })
})

describe('loadCaptions', () => {
  const base = 'https://www.youtube.com/api/timedtext?v=abc&fmt=json3'
  const body = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'hello' }] }] })

  it('uses the current token and mints none when YouTube answers', async () => {
    const tokens: (string | null)[] = []
    let minted = 0
    const cues = await loadCaptions(async (url) => {
      tokens.push(new URL(url).searchParams.get('pot'))
      return body
    }, base, 'CURRENT', async () => {
      minted++
      return 'FRESH'
    })
    expect(cues).toEqual([{ start: 1, end: 2, text: 'hello' }])
    expect(tokens).toEqual(['CURRENT'])
    expect(minted).toBe(0)
  })

  it('tries once more with a fresh token after an empty answer', async () => {
    const tokens: (string | null)[] = []
    const cues = await loadCaptions(async (url) => {
      const token = new URL(url).searchParams.get('pot')
      tokens.push(token)
      return token === 'FRESH' ? body : ''
    }, base, 'CURRENT', async () => 'FRESH')
    expect(cues).toHaveLength(1)
    expect(tokens).toEqual(['CURRENT', 'FRESH'])
  })

  it('reports the track as not loadable when the second try also fails', async () => {
    let requests = 0
    await expect(loadCaptions(async () => {
      requests++
      return undefined
    }, base, 'CURRENT', async () => 'FRESH')).rejects.toThrow(CAPTIONS_FAILED)
    expect(requests).toBe(2)
  })

  it('reports a body that is not JSON as not loadable', async () => {
    await expect(loadCaptions(async () => '<html>', base, 'CURRENT', async () => 'FRESH')).rejects.toThrow(CAPTIONS_FAILED)
  })
})

describe('parseJson3', () => {
  it('turns events into sorted cues in seconds', () => {
    const data = {
      events: [
        { tStartMs: 4000, dDurationMs: 1500, segs: [{ utf8: 'second' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'first ' }, { utf8: 'line' }] }
      ]
    }
    expect(parseJson3(data)).toEqual([
      { start: 1, end: 3, text: 'first line' },
      { start: 4, end: 5.5, text: 'second' }
    ])
  })

  it('drops empty events, line-break placeholders and events without a start', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 100 },
        { tStartMs: 500, segs: [{ utf8: '\n' }] },
        { dDurationMs: 100, segs: [{ utf8: 'lost' }] }
      ]
    }
    expect(parseJson3(data)).toEqual([])
  })

  it('handles data that is not a caption file', () => {
    expect(parseJson3(null)).toEqual([])
    expect(parseJson3({})).toEqual([])
  })
})
