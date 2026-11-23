import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPipReturn, PIP_BACK_LIMIT_MS } from '../../packages/shell/src/renderer/modules/watch/pipReturn'

afterEach(() => {
  vi.useRealTimers()
})

describe('createPipReturn', () => {
  it('sends the video back once, and marks it as returning', () => {
    const sent: unknown[][] = []
    const pipReturn = createPipReturn((...args) => sent.push(args), () => undefined)
    expect(pipReturn.returning.value).toBe(false)
    expect(pipReturn.back('l8qxFcaLSM4', 120, 'en')).toBe(true)
    expect(pipReturn.returning.value).toBe(true)
    expect(pipReturn.back('l8qxFcaLSM4', 125, 'en')).toBe(false)
    expect(sent).toEqual([['l8qxFcaLSM4', 120, 'en']])
  })

  it('closes the window once the limit passes after Back, unless stopped', () => {
    vi.useFakeTimers()
    const close = vi.fn()
    const pipReturn = createPipReturn(() => undefined, close)
    pipReturn.back('l8qxFcaLSM4', 0, '')
    vi.advanceTimersByTime(PIP_BACK_LIMIT_MS - 1)
    expect(close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(close).toHaveBeenCalledTimes(1)

    const stopped = vi.fn()
    const other = createPipReturn(() => undefined, stopped)
    other.back('l8qxFcaLSM4', 0, '')
    other.stop()
    vi.advanceTimersByTime(PIP_BACK_LIMIT_MS)
    expect(stopped).not.toHaveBeenCalled()
  })
})
