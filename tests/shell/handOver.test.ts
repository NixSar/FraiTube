import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHandOverRequests, HAND_OVER_REPLY_MS } from '../../packages/shell/src/main/handOver'
import { bufferedForHandOver, HAND_OVER_BUFFER_SECONDS, HAND_OVER_WAIT_MS } from '../../packages/shell/src/renderer/modules/watch/handOver'

afterEach(() => {
  vi.useRealTimers()
})

describe('createHandOverRequests', () => {
  it('passes on the exact second the asked window gives, and whether its video was paused', async () => {
    const requests = createHandOverRequests()
    const sent: number[] = []
    const playing = requests.ask({ id: 7, send: (requestId) => sent.push(requestId) })
    requests.answer(7, sent[0], { seconds: 347.141, paused: false })
    expect(await playing).toEqual({ seconds: 347.141, paused: false })
    const paused = requests.ask({ id: 7, send: (requestId) => sent.push(requestId) })
    requests.answer(7, sent[1], { seconds: 720, paused: true, extra: 'dropped' })
    expect(await paused).toEqual({ seconds: 720, paused: true })
  })

  it('ignores answers from other windows and gives nothing for a bad answer', async () => {
    const requests = createHandOverRequests()
    const sent: number[] = []
    const answer = requests.ask({ id: 7, send: (requestId) => sent.push(requestId) })
    requests.answer(8, sent[0], { seconds: 10, paused: false })
    requests.answer(7, sent[0], { seconds: -1, paused: false })
    expect(await answer).toBeUndefined()
    const bare = requests.ask({ id: 7, send: (requestId) => sent.push(requestId) })
    requests.answer(7, sent[1], 347.141)
    expect(await bare).toBeUndefined()
  })

  it('gives nothing when the window does not answer in time', async () => {
    vi.useFakeTimers()
    const requests = createHandOverRequests()
    const answer = requests.ask({ id: 7, send: () => undefined })
    vi.advanceTimersByTime(HAND_OVER_REPLY_MS)
    expect(await answer).toBeUndefined()
  })
})

describe('bufferedForHandOver', () => {
  it('is ready with three seconds buffered past the start, or up to the end of the video', () => {
    expect(HAND_OVER_BUFFER_SECONDS).toBe(3)
    expect(bufferedForHandOver(102.9, 100, 2205)).toBe(false)
    expect(bufferedForHandOver(103, 100, 2205)).toBe(true)
    expect(bufferedForHandOver(2204.6, 2203, 2205)).toBe(true)
  })

  it('stops waiting after ten seconds', () => {
    expect(HAND_OVER_WAIT_MS).toBe(10_000)
  })
})
