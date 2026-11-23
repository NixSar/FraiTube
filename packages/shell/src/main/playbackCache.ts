import { videoDetailsOf, type VideoDetails, type VideoPlayback } from '@fraitube/youtube/types'

/** How long a video's details are reused, for example by the PiP window and its Back button. */
export const PLAYBACK_MAX_AGE_MS = 10 * 60_000
/** Videos whose details are kept, as many as the YouTube connection remembers. */
export const PLAYBACK_CACHE_SIZE = 20

/** Loads a video's playback; `onDetails` gets its details as soon as they are known, before the playback is ready. */
export type LoadPlayback = (videoId: string, onDetails: (details: VideoDetails) => void) => Promise<VideoPlayback>

export interface PlaybackCache {
  /** A video's playback, reused while under 10 minutes old unless a fresh one is asked for. */
  get(videoId: string, fresh: boolean): Promise<VideoPlayback>
  /**
   * What the watch page shows about a video: from its kept playback, or as soon as its loading playback
   * knows it. A video not loading starts loading, and a later get for it uses that same load.
   */
  details(videoId: string): Promise<VideoDetails>
}

interface Loading {
  playback: Promise<VideoPlayback>
  details: Promise<VideoDetails>
}

/** Keeps the playback of playable videos, so opening the same video again shows it without fetching. */
export function createPlaybackCache(load: LoadPlayback, now: () => number = Date.now): PlaybackCache {
  const kept = new Map<string, { fetchedAt: number; playback: VideoPlayback }>()
  const loading = new Map<string, Loading>()

  function keptPlayback(videoId: string): VideoPlayback | undefined {
    const entry = kept.get(videoId)
    return entry && now() - entry.fetchedAt < PLAYBACK_MAX_AGE_MS ? entry.playback : undefined
  }

  function keep(videoId: string, fetchedAt: number, playback: VideoPlayback): void {
    kept.delete(videoId)
    // Only a playable video is kept; one that cannot play is asked about again next time.
    if (playback.sabr) {
      kept.set(videoId, { fetchedAt, playback })
      for (const oldest of kept.keys()) {
        if (kept.size <= PLAYBACK_CACHE_SIZE) break
        kept.delete(oldest)
      }
    }
  }

  function start(videoId: string): Loading {
    let giveDetails: (details: VideoDetails) => void = () => undefined
    let failDetails: (cause: unknown) => void = () => undefined
    const details = new Promise<VideoDetails>((resolve, reject) => {
      giveDetails = resolve
      failDetails = reject
    })
    // A load asked for its playback alone reports a failure there, not as an unhandled rejection.
    details.catch(() => undefined)
    const fetchedAt = now()
    const entry: Loading = {
      details,
      playback: load(videoId, (found) => giveDetails(found)).then(
        (playback) => {
          giveDetails(videoDetailsOf(playback))
          keep(videoId, fetchedAt, playback)
          return playback
        },
        (cause: unknown) => {
          failDetails(cause)
          throw cause
        }
      ).finally(() => {
        if (loading.get(videoId) === entry) {
          loading.delete(videoId)
        }
      })
    }
    // A load started for its details alone reports a failure there, not as an unhandled rejection.
    entry.playback.catch(() => undefined)
    loading.set(videoId, entry)
    return entry
  }

  return {
    get(videoId, fresh) {
      if (!fresh) {
        const playback = keptPlayback(videoId)
        if (playback) {
          return Promise.resolve(playback)
        }
        const current = loading.get(videoId)
        if (current) {
          return current.playback
        }
      }
      return start(videoId).playback
    },
    details(videoId) {
      const playback = keptPlayback(videoId)
      if (playback) {
        return Promise.resolve(videoDetailsOf(playback))
      }
      return (loading.get(videoId) ?? start(videoId)).details
    }
  }
}
