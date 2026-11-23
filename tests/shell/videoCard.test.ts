import { describe, expect, it } from 'vitest'
import { cardBadge, cardDetails, MIN_CARD_WIDTH } from '../../packages/shell/src/renderer/components/videoCard'
import { nextShownCount, PAGE_SIZE } from '../../packages/shell/src/renderer/components/paging'

describe('cards shown at a time', () => {
  it('shows 48 cards more each time, up to the whole list', () => {
    expect(PAGE_SIZE).toBe(48)
    expect(nextShownCount(48, 500)).toBe(96)
    expect(nextShownCount(480, 500)).toBe(500)
    expect(nextShownCount(48, 10)).toBe(10)
  })
})

describe('video card grid', () => {
  it('fits columns of cards at least 240 pixels wide', () => {
    expect(MIN_CARD_WIDTH).toBe(240)
  })
})

describe('cardDetails', () => {
  it('joins the non-empty parts', () => {
    const middleDot = String.fromCodePoint(0xB7)
    expect(cardDetails(['1.2K views', '2 years ago'])).toBe(`1.2K views ${middleDot} 2 years ago`)
    expect(cardDetails(['', '2 years ago', undefined])).toBe('2 years ago')
    expect(cardDetails([])).toBe('')
  })
})

describe('cardBadge', () => {
  it('shows LIVE for a live video and the length otherwise', () => {
    expect(cardBadge({ isLive: true, durationText: '3:33' })).toBe('LIVE')
    expect(cardBadge({ isLive: false, durationText: '3:33' })).toBe('3:33')
    expect(cardBadge({})).toBe('')
  })
})
