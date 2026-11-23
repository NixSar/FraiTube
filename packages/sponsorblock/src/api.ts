import { isCategory } from './categories'
import type { ActionType, Category, Segment } from './types'

export const DEFAULT_SERVER = 'https://sponsor.ajay.app'

/** Hash characters sent to the server. Many videos share a prefix, so the server cannot tell which one is asked for. */
export const HASH_PREFIX_LENGTH = 4

const ACTION_TYPES: readonly ActionType[] = ['skip', 'mute', 'poi']

/** Returns true for an https server address without a login, path, query or fragment. */
export function isServerUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    (url.pathname === '/' || url.pathname === '') &&
    url.search === '' &&
    url.hash === ''
}

/** The first characters of the video ID's SHA-256 hash, in lowercase hex. */
export async function hashPrefix(videoId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, HASH_PREFIX_LENGTH)
}

/** The address that lists the segments of every video sharing the hash prefix, for the given categories. */
export function segmentsUrl(server: string, prefix: string, categories: readonly Category[]): string {
  const url = new URL(`/api/skipSegments/${prefix}`, server)
  url.searchParams.set('categories', JSON.stringify(categories))
  url.searchParams.set('actionTypes', JSON.stringify(ACTION_TYPES))
  return url.toString()
}

interface RawSegment {
  UUID?: unknown
  category?: unknown
  actionType?: unknown
  segment?: unknown
}

interface RawVideo {
  videoID?: unknown
  segments?: unknown
}

function toSegment(raw: RawSegment): Segment | undefined {
  const [start, end] = Array.isArray(raw.segment) ? raw.segment : []
  if (
    typeof raw.UUID !== 'string' ||
    !isCategory(raw.category) ||
    !ACTION_TYPES.includes(raw.actionType as ActionType) ||
    typeof start !== 'number' || typeof end !== 'number' ||
    !Number.isFinite(start) || !Number.isFinite(end) ||
    start < 0 || end < start
  ) {
    return undefined
  }
  const actionType = raw.actionType as ActionType
  // A highlight is a point, and only highlights are points.
  if ((raw.category === 'poi_highlight') !== (actionType === 'poi')) {
    return undefined
  }
  if (actionType !== 'poi' && end === start) {
    return undefined
  }
  return { uuid: raw.UUID, category: raw.category, actionType, start, end }
}

/** The valid segments of one video from the server's answer for its hash prefix, by start time. */
export function parseSegments(data: unknown, videoId: string): Segment[] {
  if (!Array.isArray(data)) {
    return []
  }
  const video = (data as RawVideo[]).find((entry) => typeof entry === 'object' && entry !== null && entry.videoID === videoId)
  if (!video || !Array.isArray(video.segments)) {
    return []
  }
  return (video.segments as RawSegment[])
    .map((raw) => (typeof raw === 'object' && raw !== null ? toSegment(raw) : undefined))
    .filter((segment): segment is Segment => segment !== undefined)
    .sort((a, b) => a.start - b.start)
}
