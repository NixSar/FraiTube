/** Links to a video on YouTube, as the Share menu copies and opens them. */

/** The whole second a link starts at, or undefined for the start of the video. */
function startSecond(seconds: number | undefined): number | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 1) {
    return undefined
  }
  return Math.floor(seconds)
}

/** The video's page on YouTube, starting at the given second when there is one. */
export function watchLink(videoId: string, seconds?: number): string {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', videoId)
  const start = startSecond(seconds)
  if (start !== undefined) {
    url.searchParams.set('t', `${start}s`)
  }
  return url.toString()
}

/** The video's embedded player, without YouTube cookies, starting at the given second when there is one. */
export function embedLink(videoId: string, seconds?: number): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`)
  const start = startSecond(seconds)
  if (start !== undefined) {
    url.searchParams.set('start', String(start))
  }
  return url.toString()
}
