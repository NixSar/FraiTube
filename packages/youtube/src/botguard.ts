import { BotGuardClient } from 'bgutils-js/botguard'
import { buildURL, GOOG_API_KEY } from 'bgutils-js/utils'
import { WebPoMinter } from 'bgutils-js/webpo'
import type { PoTokenRequest } from './types'

// Runs inside an isolated, offscreen page whose origin is https://www.youtube.com.
// Based on https://github.com/LuanRT/BgUtils/blob/main/examples/node/innertube-challenge-fetcher-example.ts

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'

interface BgChallenge {
  interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string }
  program: string
  globalName: string
}

interface AttestationData {
  R?: { bgChallenge?: BgChallenge }
  T?: string
}

interface ClientContext {
  client: { visitorData?: string; clientVersion?: string }
}

async function fetchChallenge(request: PoTokenRequest): Promise<BgChallenge> {
  const attestation = request.initialAttestationData as AttestationData
  const initial = attestation.R?.bgChallenge
  if (initial?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue) {
    return initial
  }

  const context = request.context as ClientContext
  const response = await fetch('https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json', {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      'x-goog-visitor-id': context.client.visitorData ?? '',
      'x-youtube-client-version': context.client.clientVersion ?? '',
      'x-youtube-client-name': '1'
    },
    body: JSON.stringify({ engagementType: 'ENGAGEMENT_TYPE_UNBOUND', eacrToken: attestation.T, context })
  })
  if (!response.ok) {
    throw new Error(`BotGuard challenge request failed with status ${response.status}`)
  }

  const data = (await response.json()) as { bgChallenge?: BgChallenge }
  if (!data.bgChallenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue) {
    throw new Error('Failed to get BotGuard challenge')
  }
  return data.bgChallenge
}

export async function mintPoToken(request: PoTokenRequest): Promise<string> {
  const challenge = await fetchChallenge(request)

  let interpreterUrl = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue ?? ''
  if (interpreterUrl.startsWith('//')) {
    interpreterUrl = `https:${interpreterUrl}`
  }

  const interpreter = await (await fetch(interpreterUrl)).text()
  if (!interpreter) {
    throw new Error('Could not load the BotGuard VM')
  }

  // BotGuard reads EVENT_ID from the page config.
  Object.assign(window, { yt: { config_: request.ytConfig } })
  new Function(interpreter)()

  const botGuard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: window
  })

  const webPoSignalOutput: Parameters<typeof WebPoMinter.create>[1] = []
  const botGuardResponse = await botGuard.snapshot({ webPoSignalOutput }, 10_000)

  const integrityResponse = await fetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify([REQUEST_KEY, botGuardResponse])
  })

  const integrity = (await integrityResponse.json()) as unknown[]
  if (typeof integrity[0] !== 'string') {
    throw new Error('Could not get an integrity token')
  }

  const minter = await WebPoMinter.create({ integrityToken: integrity[0] }, webPoSignalOutput)
  return await minter.mintAsWebsafeString(request.videoId)
}
