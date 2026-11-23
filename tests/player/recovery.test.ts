import { describe, expect, it } from 'vitest'
import { RECONNECT_CALM_MS, RECONNECT_MAX_WAIT_MS, reconnectWaitMs } from '../../packages/player/src/recovery'

describe('reconnectWaitMs', () => {
  it('tries at once, then waits 1, 2, 4, 8 and 16 seconds, then 30 seconds every time', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 50].map(reconnectWaitMs)).toEqual([0, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000])
    expect(RECONNECT_MAX_WAIT_MS).toBe(30_000)
  })

  it('starts again with no wait after a minute without trouble', () => {
    expect(RECONNECT_CALM_MS).toBe(60_000)
  })
})
