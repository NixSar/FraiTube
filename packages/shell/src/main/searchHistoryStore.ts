import { createRecordTableSql, type ModuleSchema, type Storage } from '@fraitube/storage'
import { isPastSearch, searchKey, type PastSearch } from '../shared/searchHistory'

/** One record per search, keyed by its text in small letters. Removing one leaves a removal marker for sync. */
export const searchHistorySchema: ModuleSchema = {
  module: 'search_history',
  migrations: [{ version: 1, up: createRecordTableSql('search_history') }],
  synced: ['search_history']
}

export interface SearchHistoryStore {
  /** The newest `kept` searches, newest first. */
  list(kept: number): PastSearch[]
  /** Saves a search as the newest, then drops the oldest searches beyond `kept`. */
  add(query: string, kept: number): void
  remove(query: string): void
  clear(): void
}

export function createSearchHistoryStore(storage: Storage, now: () => number = Date.now): SearchHistoryStore {
  const table = storage.records<PastSearch>('search_history')

  function all(): { key: string; value: PastSearch }[] {
    return table.list()
      .filter((record) => isPastSearch(record.value))
      .sort((a, b) => b.value.searchedAt - a.value.searchedAt)
  }

  return {
    list(kept) {
      return all().slice(0, kept).map((record) => record.value)
    },
    add(query, kept) {
      table.put(searchKey(query), { query: query.trim(), searchedAt: now() })
      for (const record of all().slice(kept)) {
        table.remove(record.key)
      }
    },
    remove(query) {
      const key = searchKey(query)
      if (table.get(key) !== undefined) {
        table.remove(key)
      }
    },
    clear() {
      for (const record of table.list()) {
        table.remove(record.key)
      }
    }
  }
}
