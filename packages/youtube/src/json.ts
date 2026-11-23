/** Helpers for reading YouTube's loosely shaped JSON without trusting its shape. */

type Json = Record<string, unknown>

export function object(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : undefined
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Follows a path of keys through nested objects. */
export function dig(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    current = object(current)?.[key]
  }
  return current
}

/** The text of a `simpleText` or `runs` field, or an empty string. */
export function text(value: unknown): string {
  const simple = dig(value, 'simpleText')
  if (typeof simple === 'string') {
    return simple
  }
  return array(dig(value, 'runs')).map((run) => dig(run, 'text')).filter((part) => typeof part === 'string').join('')
}

/** The largest https picture of a thumbnail list, or an empty string. */
export function picture(value: unknown): string {
  const thumbnails = array(dig(value, 'thumbnails'))
    .map((thumbnail) => ({ url: dig(thumbnail, 'url'), width: Number(dig(thumbnail, 'width') ?? 0) }))
    .filter((thumbnail): thumbnail is { url: string; width: number } => typeof thumbnail.url === 'string' && thumbnail.url.startsWith('https://'))
  thumbnails.sort((a, b) => b.width - a.width)
  return thumbnails[0]?.url ?? ''
}
