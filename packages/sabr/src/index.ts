import { SabrStream } from 'googlevideo/sabr-stream'
import type { FormatStream, SabrFormat } from 'googlevideo/shared-types'
import { base64ToU8, buildSabrFormat } from 'googlevideo/utils'
import { createBackoffTracker, waitMs, type BackoffTracker } from './backoff'

export type { SabrFormat }
export { BACKOFF_LOOP_LIMIT, createBackoffTracker, type BackoffTracker } from './backoff'
export { listQualities, pickAudioFormat, pickVideoFormat, qualityHeight, type Quality, type VideoLimits } from './formats'

/** What YouTube returned for one video's SABR stream. */
export interface SabrInput {
  videoId: string
  serverAbrStreamingUrl: string
  ustreamerConfig: string
  clientInfo: { clientName: number; clientVersion: string; osName?: string; osVersion?: string }
  poToken: string
  formats: Record<string, unknown>[]
}

export interface OpenOptions {
  /** Left out for a live stream, which then starts at its live edge. */
  startTimeMs?: number
  videoFormat: SabrFormat
  audioFormat: SabrFormat
  fetch: typeof fetch
  /** Mints a fresh proof of origin token when YouTube rejects the current one. */
  mintPoToken?: () => Promise<string>
  /** Fetches fresh streaming data when the server asks for it or the stream URL expires. */
  reloadStreaming?: (reloadToken?: string) => Promise<{ serverAbrStreamingUrl: string; ustreamerConfig: string }>
  onError?: (error: Error) => void
}

/** The stream stopped because the server kept asking it to wait. A fresh playback usually fixes this. */
export class BackoffLoopError extends Error {
  constructor() {
    super('The video server kept asking to wait')
    this.name = 'BackoffLoopError'
  }
}

// Back-off owed by each video's streams, so a restart after a seek or quality switch still waits.
const trackers = new WeakMap<SabrInput, BackoffTracker>()

function trackerFor(input: SabrInput): BackoffTracker {
  let tracker = trackers.get(input)
  if (!tracker) {
    tracker = createBackoffTracker()
    trackers.set(input, tracker)
  }
  return tracker
}

export interface OpenedStream {
  video: ReadableStream<ArrayBufferView>
  audio: ReadableStream<ArrayBufferView>
  abort(): void
}

/** Converts YouTube's adaptive formats into the shape the SABR protocol uses. */
export function listFormats(input: SabrInput): SabrFormat[] {
  return input.formats.map((format) => buildSabrFormat(format as unknown as FormatStream))
}

/**
 * Opens a SABR stream for the chosen formats, starting at the given time.
 * A token minted after a rejection and fresh streaming data are stored on `input`, so later streams of the same video start with them.
 */
export function openStream(input: SabrInput, options: OpenOptions): OpenedStream {
  const { mintPoToken, reloadStreaming } = options
  const tracker = trackerFor(input)
  const stopped = new AbortController()
  let firstToken = true
  let firstRequest = true

  // The library keeps the server's latest request policy to itself; its back-off is read here.
  const owedBackoffMs = (): number =>
    (stream as unknown as { nextRequestPolicy?: { backoffTimeMs?: number } }).nextRequestPolicy?.backoffTimeMs ?? 0

  const fetchWithBackoff: typeof fetch = async (url, init) => {
    if (firstRequest) {
      firstRequest = false
      await waitMs(tracker.remainingMs(), stopped.signal)
    } else if (tracker.onRequest(owedBackoffMs())) {
      const error = new BackoffLoopError()
      options.onError?.(error)
      stop()
      throw error
    }
    return options.fetch(url, init)
  }

  const stream = new SabrStream({
    videoId: input.videoId,
    fetchFunction: fetchWithBackoff,
    serverAbrStreamingUrl: input.serverAbrStreamingUrl,
    videoPlaybackUstreamerConfig: input.ustreamerConfig,
    clientInfo: input.clientInfo,
    poToken: input.poToken,
    formats: listFormats(input),
    callbacks: {
      // The stream asks once on start, where the current token is still good; later asks follow a rejection.
      ...(mintPoToken && {
        onMintPoToken: async () => {
          if (firstToken) {
            firstToken = false
          } else {
            input.poToken = await mintPoToken()
          }
          return base64ToU8(input.poToken)
        }
      }),
      // Fresh streaming data is swapped into the running stream, so playback carries on untouched.
      ...(reloadStreaming && {
        onReloadPlayerResponse: async (context) => {
          const fresh = await reloadStreaming(context?.reloadPlaybackParams?.token)
          input.serverAbrStreamingUrl = fresh.serverAbrStreamingUrl
          input.ustreamerConfig = fresh.ustreamerConfig
          return { serverAbrStreamingUrl: fresh.serverAbrStreamingUrl, videoPlaybackUstreamerConfig: fresh.ustreamerConfig }
        }
      })
    }
  })

  function stop(): void {
    if (stopped.signal.aborted) return
    tracker.onStop(owedBackoffMs())
    stopped.abort()
    void stream.abort().catch(() => undefined)
  }

  if (options.onError) {
    stream.on('error', options.onError)
  }

  const { videoStream, audioStream } = stream.start({
    videoFormat: options.videoFormat,
    audioFormat: options.audioFormat,
    ...(options.startTimeMs !== undefined && { startTimeMs: options.startTimeMs }),
    isPostLiveDvr: false,
    // The player pauses reading while it has enough buffered, which must not count as a stall.
    stallDetectionMs: 10 * 60_000
  })

  return {
    video: videoStream,
    audio: audioStream,
    abort: stop
  }
}
