import { mintPoToken } from '@fraitube/youtube/botguard'
import type { PoTokenRequest } from '@fraitube/youtube/types'
import { createNativeFetch, type HiddenTask } from './native'

// Runs in the hidden page, whose address is https://www.youtube.com/. The page is loaded once per
// task: it takes its task from the Android side, runs it and hands the result back.

const native = window.FraiTubeHidden

// Every request of this page goes through the Android side, so no browser rule about other sites applies.
window.fetch = createNativeFetch(native, '/_fraitube/net/')

async function run(task: HiddenTask): Promise<string> {
  if (task.kind === 'token') {
    return mintPoToken(JSON.parse(task.payload) as PoTokenRequest)
  }
  const result: unknown = new Function(`return ${task.payload}`)()
  return JSON.stringify(result)
}

const taken = native.takeTask()
if (taken) {
  run(JSON.parse(taken) as HiddenTask).then(
    (value) => native.done(true, value),
    (cause: unknown) => native.done(false, cause instanceof Error ? cause.message : String(cause))
  )
}
