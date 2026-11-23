import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VideoDetails, VideoPlayback } from '../../packages/youtube/src/types'
import {
  canGoBackFromPip,
  closeVideo,
  controls,
  details,
  HAND_OFF_LIMIT_MS,
  handingOff,
  handOffToPip,
  handOverNow,
  takingOver,
  loadingVideo,
  openVideo,
  placeAfterLeaving,
  playback,
  playbackError,
  returnFromPip,
  startSeconds,
  startSubtitles
} from '../../packages/shell/src/renderer/modules/watch/nowPlaying'

function video(videoId: string): VideoPlayback {
  return { videoId } as VideoPlayback
}

function stubBridge(
  getPlayback: (videoId: string) => Promise<VideoPlayback>,
  getVideoDetails: (videoId: string) => Promise<VideoDetails> = () => new Promise(() => undefined)
): { closePip: ReturnType<typeof vi.fn> } {
  const closePip = vi.fn()
  vi.stubGlobal('window', { fraitube: { getPlayback, getVideoDetails, closePip } })
  return { closePip }
}

afterEach(() => {
  closeVideo()
  controls.value = undefined
  vi.unstubAllGlobals()
})

describe('leaving the watch page', () => {
  it('sends a playing video to the PiP window and closes any other', () => {
    expect(placeAfterLeaving(true)).toBe('pip')
    expect(placeAfterLeaving(false)).toBe('closed')
  })
})

describe('the PiP button', () => {
  it('goes back only to a page that is not another video', () => {
    const routeName = (path: string): string => (path.startsWith('/watch/') ? 'watch' : 'subscriptions')
    expect(canGoBackFromPip('/subscriptions', routeName)).toBe(true)
    expect(canGoBackFromPip('/watch/bbbbbbbbbbb', routeName)).toBe(false)
    expect(canGoBackFromPip(null, routeName)).toBe(false)
    expect(canGoBackFromPip(undefined, routeName)).toBe(false)
  })
})

describe('handing a video to the PiP window', () => {
  it('opens the PiP window at the exact second with the subtitle track, and keeps the video playing here', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    const openPip = vi.fn()
    Object.assign(window.fraitube, { openPip })
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => true, currentTime: 347, playheadSeconds: () => 347.141, takeOver: vi.fn(), subtitleTrackId: () => 'a.en' }
    expect(handOffToPip()).toBe(true)
    expect(openPip).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', 347.141, 'a.en')
    expect(handingOff.value).toBe(true)
    expect(playback.value?.videoId).toBe('aaaaaaaaaaa')
  })

  it('stops the video here after 15 seconds when the PiP window never takes over', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    Object.assign(window.fraitube, { openPip: vi.fn() })
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => true, currentTime: 10, playheadSeconds: () => 10, takeOver: vi.fn(), subtitleTrackId: () => '' }
    vi.useFakeTimers()
    try {
      handOffToPip()
      vi.advanceTimersByTime(HAND_OFF_LIMIT_MS - 1)
      expect(playback.value).toBeDefined()
      vi.advanceTimersByTime(1)
      expect(playback.value).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing without a video', () => {
    expect(handOffToPip()).toBe(false)
    expect(handingOff.value).toBe(false)
  })

  it('stops the video playing on out of sight and gives its exact second once PiP takes over', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => true, currentTime: 347, playheadSeconds: () => 347.141, takeOver: vi.fn(), subtitleTrackId: () => '' }
    handingOff.value = true
    expect(playback.value).toBeDefined()
    expect(handOverNow()).toEqual({ seconds: 347.141, paused: false })
    expect(playback.value).toBeUndefined()
    expect(handingOff.value).toBe(false)
  })

  it('hands a paused video over as paused', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    Object.assign(window.fraitube, { openPip: vi.fn() })
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => false, currentTime: 720, playheadSeconds: () => 720, takeOver: vi.fn(), subtitleTrackId: () => '' }
    expect(handOffToPip()).toBe(true)
    expect(handOverNow()).toEqual({ seconds: 720, paused: true })
  })

  it('stops the hidden video at once when the PiP window closes before taking over, with no later stop left waiting', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    Object.assign(window.fraitube, { openPip: vi.fn() })
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => true, currentTime: 10, playheadSeconds: () => 10, takeOver: vi.fn(), subtitleTrackId: () => '' }
    vi.useFakeTimers()
    try {
      handOffToPip()
      // The main process asks for the hand-over when the PiP window closes.
      handOverNow()
      expect(playback.value).toBeUndefined()
      await openVideo('bbbbbbbbbbb')
      vi.advanceTimersByTime(HAND_OFF_LIMIT_MS)
      expect(playback.value?.videoId).toBe('bbbbbbbbbbb')
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives nothing when no video is being handed over', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa')
    controls.value = { seekTo: vi.fn(), pause: vi.fn(), isPlaying: () => true, currentTime: 10, playheadSeconds: () => 10, takeOver: vi.fn(), subtitleTrackId: () => '' }
    expect(handOverNow()).toBeUndefined()
    expect(playback.value?.videoId).toBe('aaaaaaaaaaa')
  })

  it('stops handing over when a watch page opens a video, and stops waiting when the video closes', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    handingOff.value = true
    await openVideo('aaaaaaaaaaa')
    expect(handingOff.value).toBe(false)
    takingOver.value = true
    closeVideo()
    expect(takingOver.value).toBe(false)
  })
})

describe('a video coming back from the PiP window', () => {
  it('opens its watch page at the PiP second with its subtitles, and leaves the PiP window playing until it takes over', async () => {
    const { closePip } = stubBridge((videoId) => Promise.resolve(video(videoId)))
    expect(returnFromPip('aaaaaaaaaaa', 347.9, 'a.en')).toEqual({ t: '347', cc: 'a.en' })
    expect(takingOver.value).toBe(true)
    await openVideo('aaaaaaaaaaa', 347, 'a.en')
    expect(closePip).not.toHaveBeenCalled()
    expect(takingOver.value).toBe(true)
    expect(playback.value?.videoId).toBe('aaaaaaaaaaa')
  })

  it('leaves the subtitles to the settings when the PiP window passed none', () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    expect(returnFromPip('aaaaaaaaaaa', 12, undefined)).toEqual({ t: '12' })
    expect(returnFromPip('aaaaaaaaaaa', 12, '')).toEqual({ t: '12', cc: '' })
  })

  it('closes the PiP window and stops waiting when another video opens instead', async () => {
    const { closePip } = stubBridge((videoId) => Promise.resolve(video(videoId)))
    returnFromPip('aaaaaaaaaaa', 347, 'a.en')
    await openVideo('bbbbbbbbbbb')
    expect(closePip).toHaveBeenCalledTimes(1)
    expect(takingOver.value).toBe(false)
  })

  it('carries on where it is when the video is still playing here', async () => {
    const { closePip } = stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa')
    const seekTo = vi.fn()
    controls.value = { seekTo, pause: vi.fn(), isPlaying: () => true, currentTime: 349, playheadSeconds: () => 349, takeOver: vi.fn(), subtitleTrackId: () => '' }
    handingOff.value = true
    expect(returnFromPip('aaaaaaaaaaa', 347, 'a.en')).toEqual({})
    expect(takingOver.value).toBe(false)
    await openVideo('aaaaaaaaaaa')
    expect(seekTo).not.toHaveBeenCalled()
    expect(handingOff.value).toBe(false)
    expect(closePip).toHaveBeenCalledTimes(2)
  })
})

describe('openVideo', () => {
  it('loads the video and closes the PiP window', async () => {
    const { closePip } = stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa')
    expect(playback.value?.videoId).toBe('aaaaaaaaaaa')
    expect(loadingVideo.value).toBe(false)
    expect(closePip).toHaveBeenCalledTimes(1)
  })

  it('starts a video at the given second', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa', 347)
    expect(startSeconds.value).toBe(347)
    await openVideo('bbbbbbbbbbb')
    expect(startSeconds.value).toBeUndefined()
  })

  it('starts a video back from PiP with its subtitle track, and forgets it when the video closes', async () => {
    stubBridge((videoId) => Promise.resolve(video(videoId)))
    await openVideo('aaaaaaaaaaa', 347, 'a.en')
    expect(startSubtitles.value).toBe('a.en')
    await openVideo('bbbbbbbbbbb', 10, '')
    expect(startSubtitles.value).toBe('')
    closeVideo()
    expect(startSubtitles.value).toBeUndefined()
  })

  it('keeps the video playing when its own watch page opens again, moving to a given second', async () => {
    const getPlayback = vi.fn((videoId: string) => Promise.resolve(video(videoId)))
    stubBridge(getPlayback)
    await openVideo('aaaaaaaaaaa')
    const playing = playback.value
    const seekTo = vi.fn()
    controls.value = { seekTo, pause: vi.fn(), isPlaying: () => true, currentTime: 0, playheadSeconds: () => 0, takeOver: vi.fn(), subtitleTrackId: () => '' }
    await openVideo('aaaaaaaaaaa')
    await openVideo('aaaaaaaaaaa', 120)
    expect(playback.value).toBe(playing)
    expect(getPlayback).toHaveBeenCalledTimes(1)
    expect(seekTo).toHaveBeenCalledExactlyOnceWith(120)
  })

  it('replaces the video with another one, closing the old one while the new one loads', async () => {
    let finish: (value: VideoPlayback) => void = () => undefined
    stubBridge((videoId) => (videoId === 'aaaaaaaaaaa' ? Promise.resolve(video(videoId)) : new Promise((resolve) => { finish = resolve })))
    await openVideo('aaaaaaaaaaa')
    const loading = openVideo('bbbbbbbbbbb')
    expect(playback.value).toBeUndefined()
    expect(loadingVideo.value).toBe(true)
    finish(video('bbbbbbbbbbb'))
    await loading
    expect(playback.value?.videoId).toBe('bbbbbbbbbbb')
  })

  it('shows why a video could not be loaded', async () => {
    stubBridge(() => Promise.reject(new Error('Video unavailable')))
    await openVideo('aaaaaaaaaaa')
    expect(playback.value).toBeUndefined()
    expect(playbackError.value).toBe('Video unavailable')
  })

  it('shows the video\'s details while the video is still loading', async () => {
    let finish: (value: VideoPlayback) => void = () => undefined
    const shown = { videoId: 'aaaaaaaaaaa', title: 'Early' } as VideoDetails
    stubBridge(() => new Promise((resolve) => { finish = resolve }), () => Promise.resolve(shown))
    const loading = openVideo('aaaaaaaaaaa')
    await Promise.resolve()
    expect(details.value).toBe(shown)
    expect(playback.value).toBeUndefined()
    finish({ videoId: 'aaaaaaaaaaa', title: 'Early' } as VideoPlayback)
    await loading
    expect(details.value).toBe(shown)
    expect(playback.value?.videoId).toBe('aaaaaaaaaaa')
  })

  it('takes the details from the playback when they did not come first, and forgets them when the video closes', async () => {
    stubBridge((videoId) => Promise.resolve({ ...video(videoId), title: 'From playback', sabr: {} } as VideoPlayback), () => Promise.reject(new Error('offline')))
    await openVideo('aaaaaaaaaaa')
    expect(details.value?.title).toBe('From playback')
    expect(details.value).not.toHaveProperty('sabr')
    closeVideo()
    expect(details.value).toBeUndefined()
  })

  it('drops details that arrive after another video was opened', async () => {
    let giveOld: (value: VideoDetails) => void = () => undefined
    stubBridge(
      () => new Promise(() => undefined),
      (videoId) => (videoId === 'aaaaaaaaaaa' ? new Promise((resolve) => { giveOld = resolve }) : new Promise(() => undefined))
    )
    void openVideo('aaaaaaaaaaa')
    void openVideo('bbbbbbbbbbb')
    giveOld({ videoId: 'aaaaaaaaaaa' } as VideoDetails)
    await Promise.resolve()
    await Promise.resolve()
    expect(details.value).toBeUndefined()
  })

  it('drops a video that finishes loading after it was closed', async () => {
    let finish: (value: VideoPlayback) => void = () => undefined
    stubBridge(() => new Promise((resolve) => { finish = resolve }))
    const loading = openVideo('aaaaaaaaaaa')
    closeVideo()
    finish(video('aaaaaaaaaaa'))
    await loading
    expect(playback.value).toBeUndefined()
    expect(loadingVideo.value).toBe(false)
  })
})
