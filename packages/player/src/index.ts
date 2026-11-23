/**
 * A small Media Source Extensions player. It knows nothing about YouTube: a source opens
 * a pair of byte streams (video and audio) from a start time, and the player buffers them.
 */

export interface TrackStreams {
  video: ReadableStream<ArrayBufferView>
  audio: ReadableStream<ArrayBufferView>
  abort(): void
}

export interface PlayerSource {
  videoMimeType: string
  audioMimeType: string
  durationSeconds: number
  open(startTimeMs: number): TrackStreams
}

export interface PlayerOptions {
  /** Where playback starts, in seconds. */
  startSeconds?: number
  /** Seconds to keep buffered ahead of the playhead. */
  bufferAheadSeconds?: number
  onError?: (error: Error) => void
}

export interface PlayerHandle {
  /**
   * Carries on with another source, for example another quality or fresh streaming data, at exactly
   * the given position (the current one when left out). Resolves once the new data covers that position
   * and the playhead is on it. The element, its last picture and its fullscreen state stay as they are.
   */
  switchSource(source: PlayerSource, atSeconds?: number): Promise<void>
  destroy(): void
}

const POLL_MS = 250
const KEEP_BEHIND_SECONDS = 10
const COVERAGE_POLL_MS = 50

interface Run {
  cancelled: boolean
  startSeconds: number
  streams: TrackStreams
  readers: ReadableStreamDefaultReader<ArrayBufferView>[]
  done: Promise<unknown>
  /** Why the streams stopped, when they failed. */
  error?: Error
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function bufferedAhead(buffer: SourceBuffer, time: number): number {
  const ranges = buffer.buffered
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= time + 0.5 && ranges.end(i) >= time) {
      return ranges.end(i) - time
    }
  }
  return 0
}

function isBuffered(buffer: SourceBuffer, time: number): boolean {
  return bufferedAhead(buffer, time) > 0
}

function waitForUpdate(buffer: SourceBuffer, start: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEnd = (): void => {
      buffer.removeEventListener('error', onError)
      resolve()
    }
    const onError = (): void => {
      buffer.removeEventListener('updateend', onEnd)
      reject(new Error('The media buffer rejected data'))
    }
    buffer.addEventListener('updateend', onEnd, { once: true })
    buffer.addEventListener('error', onError, { once: true })
    try {
      start()
    } catch (error) {
      buffer.removeEventListener('updateend', onEnd)
      buffer.removeEventListener('error', onError)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function attachPlayer(video: HTMLVideoElement, initialSource: PlayerSource, options: PlayerOptions = {}): PlayerHandle {
  let source = initialSource
  const aheadSeconds = options.bufferAheadSeconds ?? 60
  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  let videoBuffer: SourceBuffer | undefined
  let audioBuffer: SourceBuffer | undefined
  let run: Run | undefined
  let destroyed = false
  let restart: Promise<void> = Promise.resolve()

  function report(error: unknown): void {
    if (!destroyed) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async function append(buffer: SourceBuffer, data: ArrayBufferView, current: Run): Promise<void> {
    const chunk = data as ArrayBufferView<ArrayBuffer>
    for (;;) {
      try {
        await waitForUpdate(buffer, () => buffer.appendBuffer(chunk))
        return
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'QuotaExceededError') || current.cancelled) {
          throw error
        }
        // The buffer is full: drop what is well behind the playhead, then wait for playback to catch up.
        const end = video.currentTime - KEEP_BEHIND_SECONDS
        if (end > 0) {
          await waitForUpdate(buffer, () => buffer.remove(0, end))
        }
        await delay(1000)
      }
    }
  }

  async function pump(reader: ReadableStreamDefaultReader<ArrayBufferView>, buffer: SourceBuffer, current: Run): Promise<void> {
    while (!current.cancelled) {
      while (!current.cancelled && bufferedAhead(buffer, video.currentTime) >= aheadSeconds) {
        await delay(POLL_MS)
      }
      if (current.cancelled) {
        return
      }
      const { value, done } = await reader.read()
      if (done || current.cancelled) {
        return
      }
      await append(buffer, value, current)
    }
  }

  function start(timeSeconds: number): void {
    if (!videoBuffer || !audioBuffer) {
      return
    }
    const streams = source.open(Math.round(timeSeconds * 1000))
    const readers = [streams.video.getReader(), streams.audio.getReader()]
    const current: Run = { cancelled: false, startSeconds: timeSeconds, streams, readers, done: Promise.resolve() }
    const [videoReader, audioReader] = readers as [ReadableStreamDefaultReader<ArrayBufferView>, ReadableStreamDefaultReader<ArrayBufferView>]

    current.done = Promise.all([pump(videoReader, videoBuffer, current), pump(audioReader, audioBuffer, current)])
      .then(() => {
        if (!current.cancelled && mediaSource.readyState === 'open' && !videoBuffer?.updating && !audioBuffer?.updating) {
          mediaSource.endOfStream()
        }
      })
      .catch((error: unknown) => {
        if (!current.cancelled) {
          current.error = error instanceof Error ? error : new Error(String(error))
          report(error)
        }
      })
    run = current
  }

  async function stop(): Promise<void> {
    const current = run
    run = undefined
    if (!current) {
      return
    }
    current.cancelled = true
    for (const reader of current.readers) {
      void reader.cancel().catch(() => undefined)
    }
    current.streams.abort()
    await current.done
  }

  function onSeeking(): void {
    const time = video.currentTime
    // The stream already running starts exactly here, for example right after a quality switch.
    if (run && run.startSeconds === time) {
      return
    }
    if (videoBuffer && audioBuffer && isBuffered(videoBuffer, time) && isBuffered(audioBuffer, time)) {
      return
    }
    // Restarts are chained so rapid seeks never run two streams at once; only the latest seek starts one.
    const target = time
    restart = restart.then(async () => {
      await stop()
      if (!destroyed && video.currentTime === target) {
        start(target)
      }
    }).catch(report)
  }

  /** Drops what is buffered from the given time on, switching the buffer to another format if needed. */
  async function trimForSwitch(buffer: SourceBuffer, fromMimeType: string, toMimeType: string, time: number): Promise<void> {
    if (fromMimeType !== toMimeType) {
      buffer.changeType(toMimeType)
    }
    const ranges = buffer.buffered
    if (ranges.length > 0 && ranges.end(ranges.length - 1) > time) {
      await waitForUpdate(buffer, () => buffer.remove(time, Infinity))
    }
  }

  /** True when the buffer holds data at the exact time. */
  function covers(buffer: SourceBuffer, time: number): boolean {
    const ranges = buffer.buffered
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= time && ranges.end(i) > time) {
        return true
      }
    }
    return false
  }

  /** Waits until both buffers hold data at the time, or fails with the stream's own error when it ends without reaching it. */
  async function waitForCoverage(time: number, current: Run): Promise<void> {
    let ended = false
    void current.done.then(() => {
      ended = true
    })
    while (!destroyed && run === current) {
      if (videoBuffer && audioBuffer && covers(videoBuffer, time) && covers(audioBuffer, time)) {
        return
      }
      if (ended) {
        throw current.error ?? new Error('The stream ended early')
      }
      await delay(COVERAGE_POLL_MS)
    }
  }

  async function switchTo(next: PlayerSource, time: number): Promise<void> {
    const previous = source
    source = next
    // Before the media source opens, the new source is simply the one it opens with.
    if (!videoBuffer || !audioBuffer || destroyed) {
      return
    }
    await stop()
    if (destroyed) {
      return
    }
    await trimForSwitch(videoBuffer, previous.videoMimeType, next.videoMimeType, time)
    await trimForSwitch(audioBuffer, previous.audioMimeType, next.audioMimeType, time)
    start(time)
    const current = run
    if (!current) {
      return
    }
    await waitForCoverage(time, current)
    // The playhead may have run on past the old data while the new data was on its way.
    if (!destroyed && run === current && video.currentTime !== time) {
      video.currentTime = time
    }
  }

  mediaSource.addEventListener('sourceopen', () => {
    try {
      if (source.durationSeconds > 0) {
        mediaSource.duration = source.durationSeconds
      }
      videoBuffer = mediaSource.addSourceBuffer(source.videoMimeType)
      audioBuffer = mediaSource.addSourceBuffer(source.audioMimeType)
      const startSeconds = options.startSeconds ?? 0
      start(startSeconds)
      if (startSeconds > 0) {
        video.currentTime = startSeconds
      }
    } catch (error) {
      report(error)
    }
  }, { once: true })

  video.addEventListener('seeking', onSeeking)
  video.src = objectUrl

  return {
    switchSource(next, atSeconds) {
      const time = atSeconds ?? video.currentTime
      // Queued behind any seek restart, so two streams never run at once.
      const switched = restart.then(() => switchTo(next, time))
      // The caller handles a failed switch; the queue itself carries on.
      restart = switched.catch(() => undefined)
      return switched
    },
    destroy() {
      destroyed = true
      video.removeEventListener('seeking', onSeeking)
      void stop()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
    }
  }
}

export * from './subtitles'
export * from './volume'
export * from './recovery'
export * from './timeline'
