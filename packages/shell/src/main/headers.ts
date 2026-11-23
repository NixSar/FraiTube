/** Request headers that make YouTube requests match what a browser sends for them. */

/**
 * The languages every YouTube request names. Without them Chromium takes them from the system locale,
 * and a C or POSIX locale makes it send "en-US,c", which YouTube answers with empty search results.
 */
export const YOUTUBE_ACCEPT_LANGUAGES = 'en-US,en'

/** The watch and home pages, which YouTube judges like a browser visit. */
export const PAGE_URL_PATTERNS = ['https://www.youtube.com/watch?*', 'https://www.youtube.com/']

/** Subtitle downloads, which youtube.com requests from its own pages. */
export const CAPTION_URL_PATTERNS = ['https://www.youtube.com/api/timedtext?*']

/** youtube.com's service worker, which subtitle requests on youtube.com come from. */
export const CAPTION_REFERER = 'https://www.youtube.com/sw.js'

export function isPageUrl(url: string): boolean {
  return url === 'https://www.youtube.com/' || url.startsWith('https://www.youtube.com/watch?')
}

export function isCaptionUrl(url: string): boolean {
  return url.startsWith('https://www.youtube.com/api/timedtext?')
}

/** Consent already given, and the computer's time zone. Nothing that identifies the user. */
export function pageCookies(timeZone: string): string {
  return `CONSENT=YES+; SOCS=CAI; PREF=tz=${timeZone.replaceAll('/', '.')}`
}

/** The headers without the ones named, compared ignoring case, and without fetch metadata. */
function withoutHeaders(headers: Record<string, string>, names: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (!names.includes(lower) && !lower.startsWith('sec-fetch-')) {
      result[name] = value
    }
  }
  return result
}

/** Returns the headers with a browser visit's fetch metadata and cookies, and without Referer and Origin. */
export function pageRequestHeaders(headers: Record<string, string>, timeZone: string): Record<string, string> {
  const result = withoutHeaders(headers, ['referer', 'origin', 'cookie'])
  result['Sec-Fetch-Dest'] = 'document'
  result['Sec-Fetch-Mode'] = 'navigate'
  result['Sec-Fetch-Site'] = 'none'
  result['Sec-Fetch-User'] = '?1'
  result['Cookie'] = pageCookies(timeZone)
  return result
}

/** Returns the headers of a subtitle request made from youtube.com itself, without Origin. */
export function captionRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const result = withoutHeaders(headers, ['referer', 'origin'])
  result['Referer'] = CAPTION_REFERER
  result['Sec-Fetch-Dest'] = 'empty'
  result['Sec-Fetch-Mode'] = 'same-origin'
  result['Sec-Fetch-Site'] = 'same-origin'
  return result
}
