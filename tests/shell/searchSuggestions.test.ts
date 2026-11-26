import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSuggester, SUGGEST_DELAY_MS } from '../../packages/shell/src/renderer/searchSuggestions'

interface Ask {
  text: string
  answer(suggestions: string[]): void
  fail(): void
}

function setUp(limit?: number) {
  const asks: Ask[] = []
  const shown: [string, string[]][] = []
  const ask = (text: string): Promise<string[]> =>
    new Promise((resolve, reject) => {
      asks.push({ text, answer: resolve, fail: () => reject(new Error('offline')) })
    })
  const suggester = createSuggester(ask, (text, suggestions) => shown.push([text, suggestions]), SUGGEST_DELAY_MS, limit)
  return { suggester, asks, shown }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSuggester', () => {
  it('waits 150 ms after the last key before asking, and asks only for the last text', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('m')
    await vi.advanceTimersByTimeAsync(100)
    suggester.type('mi')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS - 1)
    expect(asks).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(asks.map((ask) => ask.text)).toEqual(['mi'])
    asks[0]?.answer(['minecraft'])
    await vi.advanceTimersByTimeAsync(0)
    expect(shown).toEqual([['mi', ['minecraft']]])
  })

  it('drops the answer for text that was typed over', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    suggester.type('minec')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    asks[1]?.answer(['minecraft'])
    asks[0]?.answer(['mine'])
    await vi.advanceTimersByTimeAsync(0)
    expect(shown).toEqual([['minec', ['minecraft']]])
  })

  it('shows kept suggestions at once without asking again', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    asks[0]?.answer(['minecraft'])
    await vi.advanceTimersByTimeAsync(0)
    suggester.type(' mine ')
    expect(shown).toEqual([['mine', ['minecraft']], ['mine', ['minecraft']]])
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    expect(asks).toHaveLength(1)
  })

  it('keeps an answer that arrives after the text was typed over, for the next time it is typed', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    suggester.type('minec')
    asks[0]?.answer(['minecraft'])
    await vi.advanceTimersByTimeAsync(0)
    suggester.type('mine')
    expect(shown).toEqual([['mine', ['minecraft']]])
  })

  it('shows none for empty text, without asking', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    suggester.type('  ')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    expect(asks).toEqual([])
    expect(shown).toEqual([['', []]])
  })

  it('shows no suggestions for a text whose ask failed, and asks again the next time it is typed', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    asks[0]?.fail()
    await vi.advanceTimersByTimeAsync(0)
    expect(shown).toEqual([['mine', []]])
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    expect(asks).toHaveLength(2)
  })

  it('shows nothing for a failed ask whose text was typed over', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    suggester.type('minec')
    asks[0]?.fail()
    await vi.advanceTimersByTimeAsync(0)
    expect(shown).toEqual([])
  })

  it('asks nothing after stop, and drops the answers on their way', async () => {
    const { suggester, asks, shown } = setUp()
    suggester.type('mine')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    suggester.type('minec')
    suggester.stop()
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    asks[0]?.answer(['minecraft'])
    await vi.advanceTimersByTimeAsync(0)
    expect(asks).toHaveLength(1)
    expect(shown).toEqual([])
  })

  it('forgets the oldest kept text past the limit', async () => {
    const { suggester, asks } = setUp(2)
    for (const text of ['a', 'b', 'c']) {
      suggester.type(text)
      await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
      asks.at(-1)?.answer([text])
      await vi.advanceTimersByTimeAsync(0)
    }
    suggester.type('c')
    suggester.type('b')
    expect(asks).toHaveLength(3)
    suggester.type('a')
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
    expect(asks).toHaveLength(4)
  })
})
