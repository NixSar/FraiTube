import { parseLooseJSON } from 'bgutils-js/utils'

export type YtConfig = Record<string, unknown>

/** The parts of a YouTube watch page that playback needs. */
export interface WatchPage {
  ytConfig: YtConfig
  initialAttestationData: unknown
  playerId?: string
  playerResponse?: unknown
  /** The page's ytInitialData, the same data a /next request returns. */
  initialData?: unknown
}

function parseEmbedded(html: string, pattern: RegExp): unknown {
  const text = pattern.exec(html)?.[1]
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    // Not fatal: the data is requested separately when missing.
    return undefined
  }
}

/** Extracts ytcfg, the BotGuard attestation data, the player ID and the embedded player response. */
export function parseWatchPage(html: string): WatchPage {
  const ytConfigText = /ytcfg\.set\(({.+?})\);/s.exec(html)?.[1]
  if (!ytConfigText) {
    throw new Error('Could not find ytcfg in the watch page')
  }
  const ytConfig = JSON.parse(ytConfigText) as YtConfig

  const attestationText = /window\.ytAtN\(\s*({[\s\S]*?})\s*\)/.exec(html)?.[1]
  if (!attestationText) {
    throw new Error('Could not find the BotGuard challenge in the watch page')
  }
  const initialAttestationData: unknown = parseLooseJSON(attestationText)

  const playerJsUrl = typeof ytConfig['PLAYER_JS_URL'] === 'string' ? ytConfig['PLAYER_JS_URL'] : ''
  const playerId = /player\/([^/]+)\//.exec(playerJsUrl)?.[1]
    ?? /<script[^>]+src="[^">]+player\/([^/]+)\/[^"]+\/base\.js"/.exec(html)?.[1]

  const playerResponse = parseEmbedded(html, /ytInitialPlayerResponse\s*=\s*(\{.+?\});/)
  const initialData = parseEmbedded(html, /ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)

  return { ytConfig, initialAttestationData, playerId, playerResponse, initialData }
}
