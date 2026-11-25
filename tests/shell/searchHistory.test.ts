import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSearchHistoryStore, searchHistorySchema } from '../../packages/shell/src/main/searchHistoryStore'
import { searchHistoryClearWarning } from '../../packages/shell/src/renderer/modules/searchHistory/clearSearchHistory'
import {
  isPastSearch,
  isSearchQuery,
  matchingSearches,
  searchEntries,
  searchesKept,
  searchHistorySettings,
  searchKey,
  SearchHistorySettingKey
} from '../../packages/shell/src/shared/searchHistory'
import { allSettingDefinitions } from '../../packages/shell/src/shared/settings'
import { openStorage, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'search-history')
const opened: Storage[] = []
const files: string[] = []

function open(): Storage {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  const storage = openStorage(file, [searchHistorySchema])
  opened.push(storage)
  return storage
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const file of files.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(file + suffix, { force: true })
    }
  }
})

const queries = (list: { query: string }[]): string[] => list.map((search) => search.query)

describe('createSearchHistoryStore', () => {
  it('lists the newest search first, as it was typed without the spaces around it', () => {
    let time = 100
    const store = createSearchHistoryStore(open(), () => time++)
    store.add('  linux news ', 50)
    store.add('rust', 50)
    expect(store.list(50)).toEqual([{ query: 'rust', searchedAt: 101 }, { query: 'linux news', searchedAt: 100 }])
  })

  it('moves a repeated search to the top, also when only capitals and spaces differ', () => {
    let time = 100
    const store = createSearchHistoryStore(open(), () => time++)
    store.add('linux news', 50)
    store.add('rust', 50)
    store.add('Linux  News', 50)
    expect(queries(store.list(50))).toEqual(['Linux  News', 'rust'])
  })

  it('drops the oldest searches beyond the kept number, and lists no more than asked', () => {
    let time = 100
    const store = createSearchHistoryStore(open(), () => time++)
    for (const query of ['a', 'b', 'c', 'd']) {
      store.add(query, 3)
    }
    expect(queries(store.list(50))).toEqual(['d', 'c', 'b'])
    expect(queries(store.list(2))).toEqual(['d', 'c'])
  })

  it('removes one search with a removal marker for sync, and removes nothing that was not searched', () => {
    const storage = open()
    const store = createSearchHistoryStore(storage)
    store.add('rust', 50)
    store.remove('python')
    store.remove('RUST')
    expect(store.list(50)).toEqual([])
    const changes = storage.records('search_history').changesSince(0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ key: 'rust', removed: true })
  })

  it('clears every search', () => {
    let time = 100
    const store = createSearchHistoryStore(open(), () => time++)
    store.add('rust', 50)
    store.add('linux news', 50)
    store.clear()
    expect(store.list(50)).toEqual([])
  })

  it('is synced', () => {
    expect(searchHistorySchema.synced).toEqual(['search_history'])
  })
})

describe('isSearchQuery', () => {
  it('accepts text of up to 200 characters, and refuses blank text and other values', () => {
    expect(isSearchQuery('rust')).toBe(true)
    expect(isSearchQuery('a'.repeat(200))).toBe(true)
    expect(isSearchQuery('a'.repeat(201))).toBe(false)
    expect(isSearchQuery('   ')).toBe(false)
    expect(isSearchQuery('')).toBe(false)
    expect(isSearchQuery(5)).toBe(false)
    expect(isSearchQuery(undefined)).toBe(false)
  })
})

describe('isPastSearch', () => {
  it('accepts a search with the time it was made, and refuses one without', () => {
    expect(isPastSearch({ query: 'rust', searchedAt: 1 })).toBe(true)
    expect(isPastSearch({ query: 'rust' })).toBe(false)
    expect(isPastSearch({ query: ' ', searchedAt: 1 })).toBe(false)
    expect(isPastSearch(null)).toBe(false)
  })
})

describe('searchKey', () => {
  it('is the same for texts that differ only in capitals and spaces', () => {
    expect(searchKey('  Linux   News ')).toBe('linux news')
    expect(searchKey('linux news')).toBe('linux news')
  })
})

describe('matchingSearches', () => {
  const searches = [
    { query: 'linux news', searchedAt: 1 },
    { query: 'Rust tutorial', searchedAt: 3 },
    { query: 'news today', searchedAt: 2 }
  ]

  it('shows the searches that contain the typed text, newest first', () => {
    expect(queries(matchingSearches(searches, 'NEWS'))).toEqual(['news today', 'linux news'])
    expect(queries(matchingSearches(searches, ' rust '))).toEqual(['Rust tutorial'])
    expect(matchingSearches(searches, 'python')).toEqual([])
  })

  it('shows every search for empty text, at most 8 or the given number', () => {
    expect(queries(matchingSearches(searches, ''))).toEqual(['Rust tutorial', 'news today', 'linux news'])
    expect(matchingSearches(searches, '', 2)).toHaveLength(2)
    const many = Array.from({ length: 12 }, (_, index) => ({ query: `search ${index}`, searchedAt: index }))
    expect(matchingSearches(many, '')).toHaveLength(8)
  })
})

describe('searchEntries', () => {
  const past = [
    { query: 'minecraft mods', searchedAt: 2 },
    { query: 'minecraft', searchedAt: 1 }
  ]
  const entries = (list: { kind: string; query: string }[]): string[] => list.map((entry) => `${entry.kind}:${entry.query}`)

  it('shows the past searches first, then the suggestions that are not among them', () => {
    expect(entries(searchEntries(past, ['Minecraft', 'minecraft  MODS', 'minecraft song']))).toEqual([
      'past:minecraft mods',
      'past:minecraft',
      'suggestion:minecraft song'
    ])
  })

  it('leaves out suggestions found anywhere in the history, and repeated ones', () => {
    const history = [...past, { query: 'minecraft song', searchedAt: 0 }]
    expect(entries(searchEntries(past.slice(0, 1), ['minecraft song', 'minecraft', 'minecraft live', 'Minecraft Live'], history))).toEqual([
      'past:minecraft mods',
      'suggestion:minecraft live'
    ])
  })

  it('shows at most 10 entries, or the given number, and no blank suggestions', () => {
    const many = Array.from({ length: 14 }, (_, index) => `minecraft ${index}`)
    expect(searchEntries(past, many)).toHaveLength(10)
    expect(entries(searchEntries(past, ['  ', 'minecraft live'], past, 3))).toEqual([
      'past:minecraft mods',
      'past:minecraft',
      'suggestion:minecraft live'
    ])
    expect(searchEntries([], [])).toEqual([])
  })
})

describe('searchesKept', () => {
  it('is the chosen number, and 50 for a value that is not one of the choices', () => {
    expect(searchesKept('25')).toBe(25)
    expect(searchesKept('200')).toBe(200)
    expect(searchesKept('7')).toBe(50)
    expect(searchesKept(undefined)).toBe(50)
  })
})

describe('searchHistorySettings', () => {
  it('remembers searches and keeps 50 by default, with 25 to 200 to choose from', () => {
    expect(searchHistorySettings.title).toBe('Search history')
    const remember = searchHistorySettings.settings.find((setting) => setting.key === SearchHistorySettingKey.remember)
    expect(remember).toMatchObject({ type: 'boolean', default: true })
    const kept = searchHistorySettings.settings.find((setting) => setting.key === SearchHistorySettingKey.kept)
    expect(kept).toMatchObject({ type: 'choice', default: '50' })
    expect(kept?.type === 'choice' ? kept.options.map((option) => option.value) : []).toEqual(['25', '50', '100', '200'])
  })

  it('suggests searches while typing by default, synced like the other settings', () => {
    const suggest = searchHistorySettings.settings.find((setting) => setting.key === SearchHistorySettingKey.suggest)
    expect(suggest).toMatchObject({ label: 'Suggest searches while typing', type: 'boolean', default: true })
    expect(suggest && 'local' in suggest ? suggest.local : undefined).toBeUndefined()
  })

  it('is checked and stored by the main process', () => {
    const keys = allSettingDefinitions().map((setting) => setting.key)
    expect(keys).toContain(SearchHistorySettingKey.remember)
    expect(keys).toContain(SearchHistorySettingKey.kept)
    expect(keys).toContain(SearchHistorySettingKey.suggest)
  })
})

describe('searchHistoryClearWarning', () => {
  it('names how many searches are deleted', () => {
    expect(searchHistoryClearWarning(1)).toMatch(/^The 1 saved search is deleted here/)
    expect(searchHistoryClearWarning(3)).toMatch(/^All 3 saved searches are deleted here/)
  })
})
