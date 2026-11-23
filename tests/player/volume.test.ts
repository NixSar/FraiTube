import { describe, expect, it } from 'vitest'
import { MAX_VOLUME, volumeToGain } from '../../packages/player/src/volume'

describe('volumeToGain', () => {
  it('turns percent into a gain factor', () => {
    expect(volumeToGain(100)).toBe(1)
    expect(volumeToGain(150)).toBe(1.5)
    expect(volumeToGain(0)).toBe(0)
  })

  it('keeps the gain within 0 and the highest volume', () => {
    expect(volumeToGain(-20)).toBe(0)
    expect(volumeToGain(MAX_VOLUME + 100)).toBe(MAX_VOLUME / 100)
  })

  it('plays at normal loudness for a broken value', () => {
    expect(volumeToGain(Number.NaN)).toBe(1)
  })
})
