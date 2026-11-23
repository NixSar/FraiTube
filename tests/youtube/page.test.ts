import { describe, expect, it } from 'vitest'
import { parseWatchPage } from '../../packages/youtube/src/page'

const config = { PLAYER_JS_URL: '/s/player/abc123/player_ias.vflset/en_US/base.js', INNERTUBE_API_KEY: 'key' }
const attestation = "{R: {bgChallenge: {program: 'p', globalName: 'g'}}, T: 'token'}"
const playerResponse = { playabilityStatus: { status: 'OK' } }

function page(parts: string[]): string {
  return `<html><script>${parts.join('\n')}</script></html>`
}

describe('parseWatchPage', () => {
  it('extracts config, attestation, player ID and player response', () => {
    const result = parseWatchPage(page([
      `ytcfg.set(${JSON.stringify(config)});`,
      `window.ytAtN(${attestation})`,
      `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};`
    ]))

    expect(result.ytConfig['INNERTUBE_API_KEY']).toBe('key')
    expect(result.initialAttestationData).toEqual({ R: { bgChallenge: { program: 'p', globalName: 'g' } }, T: 'token' })
    expect(result.playerId).toBe('abc123')
    expect(result.playerResponse).toEqual(playerResponse)
  })

  it('leaves the player response and initial data out when they are missing', () => {
    const result = parseWatchPage(page([`ytcfg.set(${JSON.stringify(config)});`, `window.ytAtN(${attestation})`]))
    expect(result.playerResponse).toBeUndefined()
    expect(result.initialData).toBeUndefined()
  })

  it('extracts the initial data from its own script', () => {
    const initialData = { contents: { text: 'a }; b' } }
    const html = `${page([`ytcfg.set(${JSON.stringify(config)});`, `window.ytAtN(${attestation})`])}` +
      `<script>var ytInitialData = ${JSON.stringify(initialData)};</script>`
    expect(parseWatchPage(html).initialData).toEqual(initialData)
  })

  it('fails without ytcfg or the challenge', () => {
    expect(() => parseWatchPage(page([`window.ytAtN(${attestation})`]))).toThrow('ytcfg')
    expect(() => parseWatchPage(page([`ytcfg.set(${JSON.stringify(config)});`]))).toThrow('challenge')
  })
})
