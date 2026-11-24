import { describe, expect, it } from 'vitest'
import { firstCoveredTime, type BufferedRanges } from '../../packages/player/src/live'

function ranges(...pairs: [number, number][]): BufferedRanges {
  return {
    length: pairs.length,
    start: (index) => (pairs[index] as [number, number])[0],
    end: (index) => (pairs[index] as [number, number])[1]
  }
}

describe('firstCoveredTime', () => {
  it('gives the latest start of the first data when a live stream begins', () => {
    expect(firstCoveredTime([ranges([30871.7, 30896.4]), ranges([30871.9, 30896.0])], 0)).toBe(30871.9)
  })

  it('gives the time itself when every buffer holds data there', () => {
    expect(firstCoveredTime([ranges([10, 20]), ranges([5, 30])], 12)).toBe(12)
  })

  it('moves past old data that only one buffer still holds', () => {
    const video = ranges([24034.67, 24084.43], [24084.67, 24134.67])
    const audio = ranges([24034.67, 24084.6], [24084.7, 24134.6])
    expect(firstCoveredTime([video, audio], 24084.43)).toBe(24084.7)
  })

  it('waits while a buffer has no data at or after the time', () => {
    expect(firstCoveredTime([ranges([10, 20]), ranges()], 0)).toBeUndefined()
    expect(firstCoveredTime([ranges([10, 20]), ranges([5, 9])], 0)).toBeUndefined()
  })
})
