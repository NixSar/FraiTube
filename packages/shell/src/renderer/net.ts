/** A fetch function that sends requests through the main process, which allows only YouTube hosts. */
export const bridgeFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  const signal = init?.signal ?? undefined
  signal?.throwIfAborted()

  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((value, name) => {
    headers[name] = value
  })

  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    throw new TypeError(`Unsupported method ${method}`)
  }

  const body = init?.body == null ? undefined : new Uint8Array(await new Response(init.body).arrayBuffer())

  const pending = window.fraitube.fetch({ url, method, headers, body })
  const response = await (signal
    ? Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      ])
    : pending)

  const noBody = response.status === 204 || response.status === 304
  return new Response(noBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}
