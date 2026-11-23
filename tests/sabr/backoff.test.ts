import { describe, expect, it } from 'vitest'
import { BACKOFF_LOOP_LIMIT, createBackoffTracker, waitMs } from '../../packages/sabr/src/backoff'

describe('createBackoffTracker', () => {
  it('makes a new stream wait out what a stopped one still owed', () => {
    let now = 1000
    const tracker = createBackoffTracker(() => now)
    expect(tracker.remainingMs()).toBe(0)
    tracker.onStop(5000)
    now = 3000
    expect(tracker.remainingMs()).toBe(3000)
    now = 7000
    expect(tracker.remainingMs()).toBe(0)
  })

  it('keeps the longer of two owed waits', () => {
    const tracker = createBackoffTracker(() => 0)
    tracker.onStop(8000)
    tracker.onStop(2000)
    expect(tracker.remainingMs()).toBe(8000)
  })

  it('reports a loop after repeated back-offs in a row', () => {
    const tracker = createBackoffTracker(() => 0)
    for (let i = 1; i < BACKOFF_LOOP_LIMIT; i++) {
      expect(tracker.onRequest(1000)).toBe(false)
    }
    expect(tracker.onRequest(1000)).toBe(true)
  })

  it('starts counting again after a request without back-off', () => {
    const tracker = createBackoffTracker(() => 0)
    tracker.onRequest(1000)
    tracker.onRequest(1000)
    tracker.onRequest(0)
    expect(tracker.onRequest(1000)).toBe(false)
  })
})

describe('waitMs', () => {
  it('ends early when aborted', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const waiting = waitMs(10_000, controller.signal)
    controller.abort()
    await waiting
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
