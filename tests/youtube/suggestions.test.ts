import { describe, expect, it, vi } from 'vitest'
import { readSuggestions, suggestSearches, SUGGESTION_TEXT_LIMIT } from '../../packages/youtube/src/suggestions'

type GetInnertube = Parameters<typeof suggestSearches>[0]

function innertubeAnswering(answer: unknown): { getInnertube: GetInnertube; asked: string[] } {
  const asked: string[] = []
  const innertube = {
    getSearchSuggestions: (text: string) => {
      asked.push(text)
      return Promise.resolve(answer)
    }
  }
  return { getInnertube: (() => Promise.resolve(innertube)) as unknown as GetInnertube, asked }
}

describe('readSuggestions', () => {
  it('keeps each text once, trimmed, and leaves out blanks and other values', () => {
    expect(readSuggestions(['minecraft', ' minecraft mods ', 'minecraft', '', '  ', 5, null, 'minecraft song'])).toEqual([
      'minecraft',
      'minecraft mods',
      'minecraft song'
    ])
  })

  it('reads nothing from an answer that is not a list', () => {
    expect(readSuggestions(undefined)).toEqual([])
    expect(readSuggestions({ suggestions: ['minecraft'] })).toEqual([])
  })
})

describe('suggestSearches', () => {
  it('asks for the typed text without the spaces around it', async () => {
    const { getInnertube, asked } = innertubeAnswering(['minecraft', 'minecraft mods'])
    await expect(suggestSearches(getInnertube, '  minec ')).resolves.toEqual(['minecraft', 'minecraft mods'])
    expect(asked).toEqual(['minec'])
  })

  it('asks nothing for empty or too long text', async () => {
    const getInnertube = vi.fn()
    await expect(suggestSearches(getInnertube as unknown as GetInnertube, '   ')).resolves.toEqual([])
    await expect(suggestSearches(getInnertube as unknown as GetInnertube, 'a'.repeat(SUGGESTION_TEXT_LIMIT + 1))).resolves.toEqual([])
    expect(getInnertube).not.toHaveBeenCalled()
  })
})
