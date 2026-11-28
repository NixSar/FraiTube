import type { HiddenTask } from './native'

interface Waiting {
  resolve(value: string): void
  reject(cause: Error): void
}

const waiting = new Map<string, Waiting>()

window.fraitubeNativeResult = (callId, ok, value) => {
  const call = waiting.get(callId)
  if (!call) {
    return
  }
  waiting.delete(callId)
  if (ok) {
    call.resolve(value)
  } else {
    call.reject(new Error(value))
  }
}

/** Starts a call on the Android side that answers later, and waits for its answer. */
export function awaitNative(start: (callId: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const callId = crypto.randomUUID()
    waiting.set(callId, { resolve, reject })
    try {
      start(callId)
    } catch (error) {
      waiting.delete(callId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

let openPickers = 0

/** True while a picker opened with `awaitPicker` has not answered yet. */
export function pickerOpen(): boolean {
  return openPickers > 0
}

/** As `awaitNative`, for a call that opens one of Android's pickers over the page. */
export async function awaitPicker(start: (callId: string) => void): Promise<string> {
  openPickers++
  try {
    return await awaitNative(start)
  } finally {
    openPickers--
  }
}

/** Runs a task in the hidden page, which has YouTube's address and nothing of the app in it. */
export function runHidden(kind: HiddenTask['kind'], payload: string): Promise<string> {
  return awaitNative((callId) => window.FraiTubeNative.run(callId, kind, payload))
}
