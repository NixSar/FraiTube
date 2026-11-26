import { describe, expect, it } from 'vitest'
import { SEARCH_EXPIRED_MESSAGE, type VideoResult } from '../../packages/youtube/src/types'
import {
  KEPT_SEARCHES,
  addPage,
  createSearchMemory,
  isExpiredSearch,
  type KeptSearch
} from '../../packages/shell/src/renderer/modules/search/searchMemory'

function video(id: string): VideoResult {
  return { id, title: id, channelId: '', channelName: '', channelAvatar: '', durationText: '', viewsText: '', publishedText: '', thumbnail: '', isLive: false }
}

function kept(...videoIds: string[]): KeptSearch {
  return { videos: videoIds.map(video), channels: [], shorts: [], continuation: 'next' }
}

describe('createSearchMemory', () => {
  it('gives back a kept search by its text and filter', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a', 'b'))
    expect(memory.get('cats', 'all')).toEqual(kept('a', 'b'))
    expect(memory.get('cats', 'videos')).toBeUndefined()
    expect(memory.get('dogs', 'all')).toBeUndefined()
  })

  it('keeps a search apart for each Show Shorts setting', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a'), true)
    expect(memory.get('cats', 'all')).toBeUndefined()
    expect(memory.get('cats', 'all', false)).toBeUndefined()
    expect(memory.get('cats', 'all', true)).toEqual(kept('a'))
    memory.keep('cats', 'all', kept('b'))
    expect(memory.get('cats', 'all', true)).toEqual(kept('a'))
    expect(memory.get('cats', 'all', false)).toEqual(kept('b'))
  })

  it('keeps a copy, so later changes to the shown lists do not change it', () => {
    const memory = createSearchMemory()
    const search = kept('a')
    memory.keep('cats', 'all', search)
    search.videos.push(video('b'))
    memory.get('cats', 'all')?.videos.push(video('c'))
    expect(memory.get('cats', 'all')?.videos.map((found) => found.id)).toEqual(['a'])
  })

  it('replaces what was kept when a search shows more', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a'))
    memory.keep('cats', 'all', { ...kept('a', 'b'), continuation: 'later' })
    expect(memory.get('cats', 'all')).toEqual({ ...kept('a', 'b'), continuation: 'later' })
  })

  it('keeps no token for a search without a next page', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', { videos: [], channels: [], shorts: [] })
    expect(memory.get('cats', 'all')).toEqual({ videos: [], channels: [], shorts: [] })
  })

  it('drops the search used longest ago once it holds too many', () => {
    const memory = createSearchMemory(2)
    memory.keep('one', 'all', kept('1'))
    memory.keep('two', 'all', kept('2'))
    memory.get('one', 'all')
    memory.keep('three', 'all', kept('3'))
    expect(memory.get('two', 'all')).toBeUndefined()
    expect(memory.get('one', 'all')).toBeDefined()
    expect(memory.get('three', 'all')).toBeDefined()
  })

  it('forgets a search text with every filter and both Show Shorts settings, and no other text', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a'))
    memory.keep('cats', 'videos', kept('b'))
    memory.keep('cats', 'shorts', kept('c'), true)
    memory.keep('big cats', 'all', kept('d'))
    memory.forget('cats')
    expect(memory.get('cats', 'all')).toBeUndefined()
    expect(memory.get('cats', 'videos')).toBeUndefined()
    expect(memory.get('cats', 'shorts', true)).toBeUndefined()
    expect(memory.get('big cats', 'all')).toEqual(kept('d'))
  })

  it('keeps as many searches as the main process keeps next pages for', () => {
    expect(KEPT_SEARCHES).toBe(50)
  })

  it('adds a next page that arrives late to the search kept with its token', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a', 'b'))
    memory.addLatePage('cats', 'all', 'next', { ...kept('b', 'c'), continuation: 'later' })
    expect(memory.get('cats', 'all')).toEqual({ ...kept('a', 'b', 'c'), continuation: 'later' })
  })

  it('leaves a kept search as it is when a late page was asked with another token, or for another search', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a'))
    memory.addLatePage('cats', 'all', 'earlier', kept('b'))
    memory.addLatePage('cats', 'videos', 'next', kept('b'))
    memory.addLatePage('cats', 'all', 'next', kept('b'), true)
    expect(memory.get('cats', 'all')).toEqual(kept('a'))
    expect(memory.get('cats', 'videos')).toBeUndefined()
  })

  it('drops one search, and keeps the same text with another filter', () => {
    const memory = createSearchMemory()
    memory.keep('cats', 'all', kept('a'))
    memory.keep('cats', 'videos', kept('b'))
    memory.drop('cats', 'all')
    expect(memory.get('cats', 'all')).toBeUndefined()
    expect(memory.get('cats', 'videos')).toEqual(kept('b'))
  })
})

describe('addPage', () => {
  it('adds each video, short and channel once, and takes the page\'s token', () => {
    const channel = { id: 'UC1', name: 'One', handle: '', subscribersText: '', avatar: '' }
    const search: KeptSearch = { videos: [video('a')], channels: [channel], shorts: [video('s')], continuation: 'next' }
    addPage(search, { videos: [video('a'), video('s'), video('b')], channels: [channel], shorts: [video('a'), video('t')], continuation: 'later' })
    expect(search.videos.map((found) => found.id)).toEqual(['a', 'b'])
    expect(search.shorts.map((found) => found.id)).toEqual(['s', 't'])
    expect(search.channels).toEqual([channel])
    expect(search.continuation).toBe('later')
  })

  it('leaves no token after the last page', () => {
    const search = kept('a')
    addPage(search, { videos: [video('b')], channels: [], shorts: [] })
    expect(search).toEqual({ videos: [video('a'), video('b')], channels: [], shorts: [] })
  })
})

describe('isExpiredSearch', () => {
  it('knows the error of a next page that is gone, also as the main process passes it on', () => {
    expect(isExpiredSearch(new Error(SEARCH_EXPIRED_MESSAGE))).toBe(true)
    expect(isExpiredSearch(new Error(`Error invoking remote method 'youtube:search': Error: ${SEARCH_EXPIRED_MESSAGE}`))).toBe(true)
    expect(isExpiredSearch(new Error('offline'))).toBe(false)
    expect(isExpiredSearch(SEARCH_EXPIRED_MESSAGE)).toBe(false)
  })
})
