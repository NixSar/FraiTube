import { isHandOver, type HandOver } from '../shared/pip'

/** How long a window has to answer a hand-over request before the taking player starts on its own. */
export const HAND_OVER_REPLY_MS = 2000

/** A window asked to hand over its video. */
export interface HandOverTarget {
  /** The window's web contents ID; only its answer counts. */
  id: number
  /** Sends the request to the window. */
  send(requestId: number): void
}

export interface HandOverRequests {
  /** Asks the window to stop its video, and resolves with the second it reached and whether it was paused, or undefined. */
  ask(target: HandOverTarget): Promise<HandOver | undefined>
  /** A window's answer to a request; answers from any other window are ignored, and a bad answer gives nothing. */
  answer(senderId: number, requestId: unknown, handOver: unknown): void
}

export function createHandOverRequests(replyMs: number = HAND_OVER_REPLY_MS): HandOverRequests {
  let nextId = 0
  const pending = new Map<number, { targetId: number; finish: (handOver: HandOver | undefined) => void }>()

  return {
    ask(target) {
      const requestId = ++nextId
      return new Promise((resolve) => {
        const timer = setTimeout(() => finish(undefined), replyMs)
        function finish(handOver: HandOver | undefined): void {
          clearTimeout(timer)
          pending.delete(requestId)
          resolve(handOver)
        }
        pending.set(requestId, { targetId: target.id, finish })
        target.send(requestId)
      })
    },
    answer(senderId, requestId, handOver) {
      const request = typeof requestId === 'number' ? pending.get(requestId) : undefined
      if (request && request.targetId === senderId) {
        request.finish(isHandOver(handOver) ? { seconds: handOver.seconds, paused: handOver.paused } : undefined)
      }
    }
  }
}
