import { describe, expect, it } from 'vitest'
import { canFetchMore } from '../../packages/shell/src/renderer/modules/watch/commentPaging'

describe('canFetchMore', () => {
  it('fetches the next page while one is there and none is being fetched', () => {
    expect(canFetchMore({ continuation: 'next', loading: false, failed: false }, false)).toBe(true)
    expect(canFetchMore({ continuation: 'next', loading: true, failed: false }, false)).toBe(false)
    expect(canFetchMore({ continuation: undefined, loading: false, failed: false }, false)).toBe(false)
  })

  it('fetches nothing more after a failed page until Try again is pressed', () => {
    expect(canFetchMore({ continuation: 'next', loading: false, failed: true }, false)).toBe(false)
    expect(canFetchMore({ continuation: 'next', loading: false, failed: true }, true)).toBe(true)
  })
})
