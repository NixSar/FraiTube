import type { CaptionCue, CaptionTrack } from './types'

/** A caption track as YouTube lists it in the player response. */
export interface RawCaptionTrack {
  baseUrl?: string
  name?: { simpleText?: string; runs?: { text?: string }[] }
  languageCode?: string
  kind?: string
  vssId?: string
}

export interface CaptionSource extends CaptionTrack {
  /** The download URL without a proof of origin token, which is added when the track is requested. */
  url: string
}

/** The message shown when a track could not be loaded, also with a fresh token. */
export const CAPTIONS_FAILED = 'These subtitles could not be loaded'
/** The message shown when YouTube answers a track request with 429 Too Many Requests. */
export const CAPTIONS_REFUSED = 'YouTube is refusing subtitle requests from this connection for now'
/** The HTTP status YouTube refuses requests from a connection with. */
const TOO_MANY_REQUESTS = 429

/**
 * The message for a track that could not be loaded. The error comes from the main process, which
 * wraps the message of the error thrown there in its own text.
 */
export function captionErrorText(cause: unknown): string {
  return cause instanceof Error && cause.message.includes(CAPTIONS_REFUSED) ? CAPTIONS_REFUSED : CAPTIONS_FAILED
}

function trackLabel(track: RawCaptionTrack): string {
  return track.name?.simpleText ?? track.name?.runs?.map((run) => run.text ?? '').join('') ?? track.languageCode ?? ''
}

/** Reads the caption tracks and builds each one's download URL. */
export function readCaptionTracks(raw: readonly RawCaptionTrack[], clientName: string): CaptionSource[] {
  const tracks: CaptionSource[] = []
  raw.forEach((track, index) => {
    if (!track.baseUrl) return
    const url = new URL(track.baseUrl, 'https://www.youtube.com')
    if (url.hostname !== 'www.youtube.com') return
    url.searchParams.set('fmt', 'json3')
    url.searchParams.set('c', clientName)
    // xosf=1 moves every line to the top right corner.
    url.searchParams.delete('xosf')
    tracks.push({
      id: track.vssId ?? `track${index}`,
      label: trackLabel(track),
      language: track.languageCode ?? '',
      auto: track.kind === 'asr',
      url: url.toString()
    })
  })
  return tracks
}

/** A track's download URL carrying the given proof of origin token. */
export function captionUrl(url: string, poToken: string): string {
  const withToken = new URL(url)
  withToken.searchParams.set('potc', '1')
  withToken.searchParams.set('pot', poToken)
  return withToken.toString()
}

/** A track request's HTTP status and response body. */
export interface CaptionResponse {
  status: number
  body: string
}

/** Requests a track; a request that fails before any answer rejects. */
export type FetchCaptionBody = (url: string) => Promise<CaptionResponse>

/** The response body when YouTube sent the track, or undefined. */
function trackBody(response: CaptionResponse): string | undefined {
  if (response.status === TOO_MANY_REQUESTS) {
    throw new Error(CAPTIONS_REFUSED)
  }
  return response.status === 200 && response.body.trim() ? response.body : undefined
}

/**
 * Loads a track with the video's current token. When YouTube sends nothing back, a fresh token is
 * minted and the track is requested once more. A refusal with 429 ends at once, since a fresh token
 * does not change it.
 */
export async function loadCaptions(
  fetchBody: FetchCaptionBody,
  url: string,
  poToken: string,
  freshPoToken: () => Promise<string>
): Promise<CaptionCue[]> {
  const body =
    trackBody(await fetchBody(captionUrl(url, poToken))) ??
    trackBody(await fetchBody(captionUrl(url, await freshPoToken())))
  if (!body) {
    throw new Error(CAPTIONS_FAILED)
  }
  try {
    return parseJson3(JSON.parse(body))
  } catch {
    throw new Error(CAPTIONS_FAILED)
  }
}

interface Json3 {
  events?: {
    tStartMs?: number
    dDurationMs?: number
    segs?: { utf8?: string }[]
  }[]
}

/** Turns YouTube's JSON caption format into cues, dropping empty events and line-break placeholders. */
export function parseJson3(data: unknown): CaptionCue[] {
  const cues: CaptionCue[] = []
  for (const event of (data as Json3 | null)?.events ?? []) {
    const text = (event.segs ?? []).map((segment) => segment.utf8 ?? '').join('').trim()
    if (!text || event.tStartMs === undefined) continue
    const start = event.tStartMs / 1000
    cues.push({ start, end: start + (event.dDurationMs ?? 0) / 1000, text })
  }
  return cues.sort((a, b) => a.start - b.start)
}
