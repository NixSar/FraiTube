import { describe, expect, it } from 'vitest'
import { CAPTIONS_FAILED, CAPTIONS_REFUSED, captionErrorText, captionUrl, loadCaptions, parseJson3, readCaptionTracks } from '../../packages/youtube/src/captions'

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
      return { status: 200, body }
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
      return { status: 200, body: token === 'FRESH' ? body : '' }
    }, base, 'CURRENT', async () => 'FRESH')
    expect(cues).toHaveLength(1)
    expect(tokens).toEqual(['CURRENT', 'FRESH'])
  })

  it('reports the track as not loadable when the second try also fails', async () => {
    let requests = 0
    await expect(loadCaptions(async () => {
      requests++
      return { status: 403, body: '' }
    }, base, 'CURRENT', async () => 'FRESH')).rejects.toThrow(CAPTIONS_FAILED)
    expect(requests).toBe(2)
  })

  it('reports a body that is not JSON as not loadable', async () => {
    await expect(loadCaptions(async () => ({ status: 200, body: '<html>' }), base, 'CURRENT', async () => 'FRESH')).rejects.toThrow(CAPTIONS_FAILED)
  })

  it('reports a refusal with 429 at once, without minting a fresh token', async () => {
    let requests = 0
    let minted = 0
    await expect(loadCaptions(async () => {
      requests++
      return { status: 429, body: '<html>' }
    }, base, 'CURRENT', async () => {
      minted++
      return 'FRESH'
    })).rejects.toThrow(CAPTIONS_REFUSED)
    expect(requests).toBe(1)
    expect(minted).toBe(0)
  })

  it('reports a refusal of the second try too', async () => {
    const statuses = [200, 429]
    await expect(loadCaptions(async () => ({ status: statuses.shift() ?? 0, body: '' }), base, 'CURRENT', async () => 'FRESH')).rejects.toThrow(CAPTIONS_REFUSED)
  })
})

describe('captionErrorText', () => {
  it('names a refusal from the main process, whose error wraps the message', () => {
    expect(captionErrorText(new Error(`Error invoking remote method 'youtube:captions': Error: ${CAPTIONS_REFUSED}`))).toBe(CAPTIONS_REFUSED)
  })

  it('reports any other failure as not loadable', () => {
    expect(captionErrorText(new Error('Request refused'))).toBe(CAPTIONS_FAILED)
    expect(captionErrorText('offline')).toBe(CAPTIONS_FAILED)
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
