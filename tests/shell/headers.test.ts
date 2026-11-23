import { describe, expect, it } from 'vitest'
import { captionRequestHeaders, isCaptionUrl, isPageUrl, pageCookies, pageRequestHeaders } from '../../packages/shell/src/main/headers'

describe('isPageUrl', () => {
  it('matches the watch and home pages only', () => {
    expect(isPageUrl('https://www.youtube.com/')).toBe(true)
    expect(isPageUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(isPageUrl('https://www.youtube.com/youtubei/v1/player')).toBe(false)
    expect(isPageUrl('https://www.youtube.com/api/timedtext?v=x')).toBe(false)
  })
})

describe('pageCookies', () => {
  it('gives consent and the time zone with dots for slashes', () => {
    expect(pageCookies('America/Argentina/Buenos_Aires')).toBe('CONSENT=YES+; SOCS=CAI; PREF=tz=America.Argentina.Buenos_Aires')
  })
})

describe('pageRequestHeaders', () => {
  it('looks like a browser visit from the address bar', () => {
    const headers = pageRequestHeaders({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://example.com/',
      Origin: 'https://example.com',
      'Sec-Fetch-Mode': 'cors',
      'sec-fetch-dest': 'empty',
      Cookie: 'OTHER=1'
    }, 'Europe/Belgrade')
    expect(headers).toEqual({
      'User-Agent': 'Mozilla/5.0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      Cookie: 'CONSENT=YES+; SOCS=CAI; PREF=tz=Europe.Belgrade'
    })
  })
})

describe('isCaptionUrl', () => {
  it('matches subtitle downloads only', () => {
    expect(isCaptionUrl('https://www.youtube.com/api/timedtext?v=x&fmt=json3')).toBe(true)
    expect(isCaptionUrl('https://www.youtube.com/watch?v=x')).toBe(false)
    expect(isCaptionUrl('https://evil.example/api/timedtext?v=x')).toBe(false)
  })
})

describe('captionRequestHeaders', () => {
  it('looks like a request from youtube.com itself', () => {
    const headers = captionRequestHeaders({
      'User-Agent': 'Mozilla/5.0',
      referer: 'https://example.com/',
      Origin: 'https://example.com',
      'Sec-Fetch-Site': 'cross-site',
      'sec-fetch-mode': 'cors'
    })
    expect(headers).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.youtube.com/sw.js',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'same-origin',
      'Sec-Fetch-Site': 'same-origin'
    })
  })
})
