import { afterEach, describe, expect, it, vi } from 'vitest'
import { afterSearch, finishWithin, QUIT_SYNC_LIMIT_MS, syncBeforeQuit } from '../../packages/shell/src/main/syncTiming'

afterEach(() => {
  vi.useRealTimers()
})

describe('the sync before quitting', () => {
  it('lets the app quit as soon as the sync is done', async () => {
    vi.useFakeTimers()
    let finish: () => void = () => undefined
    let quit = false
    void finishWithin(new Promise<void>((resolve) => { finish = resolve }), QUIT_SYNC_LIMIT_MS).then(() => { quit = true })
    await vi.advanceTimersByTimeAsync(5000)
    expect(quit).toBe(false)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(quit).toBe(true)
  })

  it('runs one sync when sync is on, and none while it is off', async () => {
    const run = vi.fn(() => Promise.resolve())
    await syncBeforeQuit(false, run)
    expect(run).not.toHaveBeenCalled()
    await syncBeforeQuit(true, run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('lets the app quit after a failed sync', async () => {
    await expect(finishWithin(Promise.reject(new Error('offline')), QUIT_SYNC_LIMIT_MS)).resolves.toBeUndefined()
  })

  it('lets the app quit after 30 seconds when the sync hangs', async () => {
    vi.useFakeTimers()
    let quit = false
    void finishWithin(new Promise(() => undefined), QUIT_SYNC_LIMIT_MS).then(() => { quit = true })
    expect(QUIT_SYNC_LIMIT_MS).toBe(30_000)
    await vi.advanceTimersByTimeAsync(QUIT_SYNC_LIMIT_MS - 1)
    expect(quit).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(quit).toBe(true)
  })
})

describe('the sync on start', () => {
  it('waits for the search for rclone, so it uses the path found', async () => {
    let found: () => void = () => undefined
    const start = vi.fn()
    const started = afterSearch(new Promise<void>((resolve) => { found = resolve }), start)
    await Promise.resolve()
    expect(start).not.toHaveBeenCalled()
    found()
    await started
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('still starts when the search failed', async () => {
    const start = vi.fn()
    await afterSearch(Promise.reject(new Error('no PATH')), start)
    expect(start).toHaveBeenCalledTimes(1)
  })
})
