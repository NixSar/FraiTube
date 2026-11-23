import type { Storyboard } from './types'

/** Hosts the preview sheets may come from; the page's image policy allows them. */
const SHEET_HOST = /^i\d*\.ytimg\.com$/

/**
 * Reads YouTube's storyboard spec: a URL template, then one level per "|", each
 * "width#height#count#columns#rows#interval#name#signature". The level with the largest pictures is used.
 * Undefined when the spec is missing or does not fit that shape.
 */
export function readStoryboard(spec: unknown, durationSeconds: number): Storyboard | undefined {
  if (typeof spec !== 'string' || spec.length > 10_000) {
    return undefined
  }
  const [template, ...levels] = spec.split('|')
  if (!template || levels.length === 0) {
    return undefined
  }
  let base: URL
  try {
    base = new URL(template.replace('$L', '0').replace('$N', 'x').replace('$M', '0'))
  } catch {
    return undefined
  }
  if (base.protocol !== 'https:' || !SHEET_HOST.test(base.hostname)) {
    return undefined
  }

  const index = levels.length - 1
  const fields = (levels[index] ?? '').split('#')
  const [width, height, count, columns, rows, interval] = fields.slice(0, 6).map(Number) as number[]
  const name = fields[6] ?? ''
  const signature = fields[7] ?? ''
  if (![width, height, count, columns, rows, interval].every((value) => Number.isInteger(value) && (value ?? -1) >= 0) ||
    !width || !height || !count || !columns || !rows || !/^[\w$]*$/.test(name)) {
    return undefined
  }
  const intervalMs = interval || (durationSeconds > 0 ? (durationSeconds * 1000) / count : 0)
  if (!intervalMs) {
    return undefined
  }

  let url = template.replace('$L', String(index)).replace('$N', name)
  if (signature) {
    url += `${url.includes('?') ? '&' : '?'}sigh=${encodeURIComponent(signature)}`
  }
  return { url, width, height, count, columns, rows, intervalMs }
}
