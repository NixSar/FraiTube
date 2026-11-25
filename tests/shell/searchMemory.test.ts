import { describe, expect, it } from 'vitest'
import type { VideoResult } from '../../packages/youtube/src/types'
import { KEPT_SEARCHES, createSearchMemory, type KeptSearch } from '../../packages/shell/src/renderer/modules/search/searchMemory'

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

  it('keeps as many searches as the main process keeps next pages for', () => {
    expect(KEPT_SEARCHES).toBe(50)
  })
})
