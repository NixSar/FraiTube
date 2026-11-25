const VIDEO_ID = /^[\w-]{11}$/
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/', '/v/']

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value)
}

/** Returns the video ID from a bare ID or a YouTube video link, or undefined. */
export function parseVideoId(input: string): string | undefined {
  const text = input.trim()
  if (isVideoId(text)) {
    return text
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return undefined
  }

  const host = url.hostname.toLowerCase()
  let candidate: string | null | undefined

  if (host === 'youtu.be') {
    candidate = url.pathname.slice(1).split('/')[0]
  } else if (VIDEO_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v')
    } else {
      const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p))
      candidate = prefix ? url.pathname.slice(prefix.length).split('/')[0] : undefined
    }
  }

  return isVideoId(candidate) ? candidate : undefined
}

/** True for a YouTube Shorts link, such as youtube.com/shorts/ followed by a video ID. */
export function isShortsLink(input: string): boolean {
  const text = input.trim()
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return VIDEO_HOSTS.has(url.hostname.toLowerCase()) && url.pathname.startsWith('/shorts/') && parseVideoId(text) !== undefined
  } catch {
    return false
  }
}

/**
 * Returns the video ID from a YouTube video link, or undefined. Unlike parseVideoId, a bare ID is not
 * taken as a video, since an eleven-letter search word looks the same.
 */
export function videoIdFromLink(input: string): string | undefined {
  return isVideoId(input.trim()) ? undefined : parseVideoId(input)
}
