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
    start(callId)
  })
}

/** Runs a task in the hidden page, which has YouTube's address and nothing of the app in it. */
export function runHidden(kind: HiddenTask['kind'], payload: string): Promise<string> {
  return awaitNative((callId) => window.FraiTubeNative.run(callId, kind, payload))
}
