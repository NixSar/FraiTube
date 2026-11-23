import { describe, expect, it, vi } from 'vitest'
import { createPlaybackCache, PLAYBACK_CACHE_SIZE, PLAYBACK_MAX_AGE_MS } from '../../packages/shell/src/main/playbackCache'
import type { VideoDetails, VideoPlayback } from '../../packages/youtube/src/types'

function playable(videoId: string): VideoPlayback {
  return { videoId, sabr: {} } as VideoPlayback
}

describe('createPlaybackCache', () => {
  it('reuses a video\'s details for 10 minutes, then fetches them again', async () => {
    let time = 0
    const load = vi.fn((videoId: string) => Promise.resolve(playable(videoId)))
    const cache = createPlaybackCache(load, () => time)

    expect(PLAYBACK_MAX_AGE_MS).toBe(10 * 60_000)
    const first = await cache.get('aaaaaaaaaaa', false)
    time = PLAYBACK_MAX_AGE_MS - 1
    expect(await cache.get('aaaaaaaaaaa', false)).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)

    time = PLAYBACK_MAX_AGE_MS
    await cache.get('aaaaaaaaaaa', false)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('fetches fresh details when asked, as reconnecting does, and keeps those', async () => {
    const load = vi.fn((videoId: string) => Promise.resolve(playable(videoId)))
    const cache = createPlaybackCache(load, () => 0)

    await cache.get('aaaaaaaaaaa', false)
    const fresh = await cache.get('aaaaaaaaaaa', true)
    expect(load).toHaveBeenCalledTimes(2)
    expect(await cache.get('aaaaaaaaaaa', false)).toBe(fresh)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('asks again about a video that cannot play, and about one that failed', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ videoId: 'aaaaaaaaaaa', status: 'LOGIN_REQUIRED' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(playable('aaaaaaaaaaa'))
    const cache = createPlaybackCache(load, () => 0)

    await cache.get('aaaaaaaaaaa', false)
    await expect(cache.get('aaaaaaaaaaa', false)).rejects.toThrow('offline')
    await cache.get('aaaaaaaaaaa', false)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('gives a video\'s details before its playback is ready, from the same single load', async () => {
    let finish: (value: VideoPlayback) => void = () => undefined
    const early = { videoId: 'aaaaaaaaaaa', title: 'Early' } as VideoDetails
    const load = vi.fn((_videoId: string, onDetails: (details: VideoDetails) => void) => {
      onDetails(early)
      return new Promise<VideoPlayback>((resolve) => { finish = resolve })
    })
    const cache = createPlaybackCache(load, () => 0)

    expect(await cache.details('aaaaaaaaaaa')).toBe(early)
    const playback = cache.get('aaaaaaaaaaa', false)
    finish(playable('aaaaaaaaaaa'))
    expect((await playback).videoId).toBe('aaaaaaaaaaa')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shares one load whichever of details and playback is asked for first', async () => {
    const load = vi.fn((videoId: string) => Promise.resolve(playable(videoId)))
    const cache = createPlaybackCache(load, () => 0)

    const [playback, details] = await Promise.all([cache.get('aaaaaaaaaaa', false), cache.details('aaaaaaaaaaa')])
    expect(playback.videoId).toBe('aaaaaaaaaaa')
    expect(details.videoId).toBe('aaaaaaaaaaa')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('gives the details of a kept video at once, without the streaming data', async () => {
    const load = vi.fn((videoId: string) => Promise.resolve({ ...playable(videoId), title: 'Kept' }))
    const cache = createPlaybackCache(load, () => 0)

    await cache.get('aaaaaaaaaaa', false)
    const details = await cache.details('aaaaaaaaaaa')
    expect(details.title).toBe('Kept')
    expect(details).not.toHaveProperty('sabr')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('fails the details along with a failed load, and loads again next time', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(playable('aaaaaaaaaaa'))
    const cache = createPlaybackCache(load, () => 0)

    await expect(cache.details('aaaaaaaaaaa')).rejects.toThrow('offline')
    expect((await cache.details('aaaaaaaaaaa')).videoId).toBe('aaaaaaaaaaa')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps the latest 20 videos', async () => {
    const load = vi.fn((videoId: string) => Promise.resolve(playable(videoId)))
    const cache = createPlaybackCache(load, () => 0)
    const ids = Array.from({ length: PLAYBACK_CACHE_SIZE + 1 }, (_, index) => `video${String(index).padStart(6, '0')}`)
    for (const id of ids) {
      await cache.get(id, false)
    }
    await cache.get(ids[PLAYBACK_CACHE_SIZE] as string, false)
    expect(load).toHaveBeenCalledTimes(PLAYBACK_CACHE_SIZE + 1)
    await cache.get(ids[0] as string, false)
    expect(load).toHaveBeenCalledTimes(PLAYBACK_CACHE_SIZE + 2)
  })
})
