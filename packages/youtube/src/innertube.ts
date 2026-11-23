import { Innertube } from 'youtubei.js'

/** One shared Innertube client, created on first use and created again after a failed start. */
export function createInnertubeLoader(fetchFunction: typeof fetch, userAgent: string): () => Promise<Innertube> {
  let innertube: Promise<Innertube> | undefined
  return () => {
    innertube ??= Innertube.create({
      fetch: fetchFunction,
      user_agent: userAgent,
      lang: 'en',
      retrieve_player: false,
      enable_session_cache: false
    }).catch((error: unknown) => {
      innertube = undefined
      throw error
    })
    return innertube
  }
}
