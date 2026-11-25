import type { Innertube } from 'youtubei.js'

/** The longest text YouTube is asked to suggest searches for, the search box's own limit. */
export const SUGGESTION_TEXT_LIMIT = 200

/** The suggestions in YouTube's answer: each text once, without empty ones. */
export function readSuggestions(answer: unknown): string[] {
  if (!Array.isArray(answer)) return []
  const suggestions: string[] = []
  for (const item of answer) {
    const suggestion = typeof item === 'string' ? item.trim() : ''
    if (suggestion && !suggestions.includes(suggestion)) suggestions.push(suggestion)
  }
  return suggestions
}

/** The searches YouTube suggests for a typed text. Empty or too long text gets none, without asking YouTube. */
export async function suggestSearches(getInnertube: () => Promise<Innertube>, text: string): Promise<string[]> {
  const typed = text.trim()
  if (!typed || typed.length > SUGGESTION_TEXT_LIMIT) return []
  const innertube = await getInnertube()
  return readSuggestions(await innertube.getSearchSuggestions(typed))
}
