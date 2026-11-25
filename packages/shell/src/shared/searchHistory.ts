import type { SettingsSection } from '@fraitube/app-api/settings'
import { MAX_QUERY_LENGTH } from './bridge'

export const SearchHistorySettingKey = {
  remember: 'searchHistory.remember',
  kept: 'searchHistory.kept',
  suggest: 'searchHistory.suggest'
} as const

/** How many searches the history can keep. */
export const SEARCHES_KEPT_CHOICES = [25, 50, 100, 200]
export const DEFAULT_SEARCHES_KEPT = 50

/** Past searches shown under the search box at most. */
export const SHOWN_PAST_SEARCHES = 8

/**
 * Settings owned by the search history module. Searches are remembered, and YouTube suggests searches
 * while typing, unless turned off here.
 */
export const searchHistorySettings: SettingsSection = {
  title: 'Search history',
  settings: [
    { key: SearchHistorySettingKey.remember, label: 'Remember searches', type: 'boolean', default: true },
    {
      key: SearchHistorySettingKey.kept,
      label: 'Searches kept',
      type: 'choice',
      options: SEARCHES_KEPT_CHOICES.map((count) => ({ value: String(count), label: String(count) })),
      default: String(DEFAULT_SEARCHES_KEPT)
    },
    { key: SearchHistorySettingKey.suggest, label: 'Suggest searches while typing', type: 'boolean', default: true }
  ]
}

/** Entries shown under the search box at most: past searches first, then suggestions. */
export const SHOWN_SEARCH_ENTRIES = 10

/** One entry under the search box: a past search, or a search YouTube suggests. */
export type SearchEntry =
  | { kind: 'past'; query: string; past: PastSearch }
  | { kind: 'suggestion'; query: string }

/**
 * The entries under the search box: the shown past searches, then the suggestions that are not in the
 * history, at most `limit` entries.
 */
export function searchEntries(
  past: readonly PastSearch[],
  suggestions: readonly string[],
  history: readonly PastSearch[] = past,
  limit = SHOWN_SEARCH_ENTRIES
): SearchEntry[] {
  const entries: SearchEntry[] = past.slice(0, limit).map((search) => ({ kind: 'past', query: search.query, past: search }))
  const taken = new Set([...past, ...history].map((search) => searchKey(search.query)))
  for (const suggestion of suggestions) {
    if (entries.length >= limit) break
    const key = searchKey(suggestion)
    if (!key || taken.has(key)) continue
    taken.add(key)
    entries.push({ kind: 'suggestion', query: suggestion })
  }
  return entries
}

/** One search in the history: the text as it was searched, and when it was last searched, in milliseconds. */
export interface PastSearch {
  query: string
  searchedAt: number
}

export function isPastSearch(value: unknown): value is PastSearch {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const search = value as Partial<PastSearch>
  return isSearchQuery(search.query) && typeof search.searchedAt === 'number'
}

/** A search text that can be saved: not blank and no longer than the search box allows. */
export function isSearchQuery(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_QUERY_LENGTH
}

/** The key a search is saved under, the same for texts that differ only in capitals and spaces. */
export function searchKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** How many searches to keep, for a saved setting value; the default for a value that is not one of the choices. */
export function searchesKept(value: unknown): number {
  const count = Number(value)
  return SEARCHES_KEPT_CHOICES.includes(count) ? count : DEFAULT_SEARCHES_KEPT
}

/** The past searches that contain the typed text, newest first, at most `limit` of them. All of them for empty text. */
export function matchingSearches(searches: readonly PastSearch[], typed: string, limit = SHOWN_PAST_SEARCHES): PastSearch[] {
  const wanted = searchKey(typed)
  return searches
    .filter((search) => searchKey(search.query).includes(wanted))
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .slice(0, limit)
}
