import { ipcMain, session, type Session } from 'electron'
import { hashPrefix, isServerUrl, parseSegments, segmentsUrl, SKIPPABLE_CATEGORIES } from '@fraitube/sponsorblock'
import type { Category, Segment } from '@fraitube/sponsorblock/types'
import { isVideoId } from '@fraitube/youtube/ids'
import { IpcChannel } from '../shared/bridge'
import { categoryModes, SponsorBlockSettingKey } from '../shared/sponsorBlockSettings'
import { fromAppWindow } from './appWindow'
import type { SettingsStore } from './settingsStore'

const REQUEST_TIMEOUT_MS = 10_000

/** An in-memory session of its own that keeps no cookies and no cache. */
function createSponsorBlockSession(userAgent: string): Session {
  const sponsorSession = session.fromPartition('sponsorblock', { cache: false })
  sponsorSession.setUserAgent(userAgent)
  sponsorSession.setPermissionCheckHandler(() => false)
  sponsorSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  sponsorSession.webRequest.onHeadersReceived(({ responseHeaders }, callback) => {
    const headers = { ...responseHeaders }
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'set-cookie') {
        delete headers[name]
      }
    }
    callback({ responseHeaders: headers })
  })
  return sponsorSession
}

export function registerSponsorBlockHandlers(settings: SettingsStore, userAgent: string): void {
  const sponsorSession = createSponsorBlockSession(userAgent)

  ipcMain.handle(IpcChannel.sponsorSegments, async (event, videoId: unknown): Promise<Segment[]> => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    // Nothing is sent while SponsorBlock is off.
    if (settings.get(SponsorBlockSettingKey.enabled) !== true) {
      return []
    }
    const server = settings.get(SponsorBlockSettingKey.server)
    if (!isServerUrl(server)) {
      throw new Error('The SponsorBlock server address must be an https address')
    }
    const modes = categoryModes((key) => settings.get(key))
    const categories: Category[] = SKIPPABLE_CATEGORIES.map((category) => category.id).filter((id) => modes[id] !== 'off')
    categories.push('poi_highlight')

    const url = segmentsUrl(server, await hashPrefix(videoId), categories)
    const response = await sponsorSession.fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    // The server answers 404 when no video with this hash prefix has segments.
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      throw new Error(`SponsorBlock request failed with status ${response.status}`)
    }
    return parseSegments(await response.json(), videoId)
  })
}
