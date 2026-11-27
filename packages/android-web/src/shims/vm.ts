import { runHidden } from '../hiddenCalls'

/**
 * Stands in for Node's vm module. YouTube's player script runs in the hidden page, away from the app
 * page, and its result comes back as plain data.
 */
export async function runInNewContext(code: string): Promise<unknown> {
  return JSON.parse(await runHidden('eval', code))
}
