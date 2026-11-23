import { ref, type Ref } from 'vue'

/** Shown in the PiP window while its video goes back to the watch page. */
export const RETURNING_STATUS = 'Returning to the watch page'
/** After Back, the PiP window closes by itself after this long if the watch page never took over. */
export const PIP_BACK_LIMIT_MS = 15_000

export interface PipReturn {
  /** True once Back was pressed, until the PiP window closes. */
  returning: Ref<boolean>
  /** Sends the video back once; pressing Back again while it returns does nothing. False when it was already sent. */
  back(videoId: string, seconds: number, subtitles: string): boolean
  /** Stops the closing timer, as the window goes. */
  stop(): void
}

/** The PiP window's Back button: the video goes back to its watch page once, and the window closes after PIP_BACK_LIMIT_MS. */
export function createPipReturn(
  send: (videoId: string, seconds: number, subtitles: string) => void,
  close: () => void,
  limitMs = PIP_BACK_LIMIT_MS
): PipReturn {
  const returning = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    returning,
    back(videoId, seconds, subtitles) {
      if (returning.value) {
        return false
      }
      returning.value = true
      send(videoId, seconds, subtitles)
      timer = setTimeout(close, limitMs)
      return true
    },
    stop() {
      clearTimeout(timer)
    }
  }
}
