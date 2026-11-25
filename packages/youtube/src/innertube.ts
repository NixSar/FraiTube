import { Innertube } from 'youtubei.js'

/** What the shared Innertube client is created with. The session is made here, without asking YouTube for its settings first. */
export function innertubeOptions(fetchFunction: typeof fetch, userAgent: string): Parameters<typeof Innertube.create>[0] {
  return {
    fetch: fetchFunction,
    user_agent: userAgent,
    lang: 'en',
    retrieve_player: false,
    enable_session_cache: false,
    generate_session_locally: true,
    retrieve_innertube_config: false
  }
}

/** One shared Innertube client, created on first use and created again after a failed start. */
export function createInnertubeLoader(fetchFunction: typeof fetch, userAgent: string): () => Promise<Innertube> {
  let innertube: Promise<Innertube> | undefined
  return () => {
    innertube ??= Innertube.create(innertubeOptions(fetchFunction, userAgent)).catch((error: unknown) => {
      innertube = undefined
      throw error
    })
    return innertube
  }
}
