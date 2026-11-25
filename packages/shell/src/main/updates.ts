import { createHash } from 'node:crypto'
import { chmod, open, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IpcChannel } from '../shared/bridge'
import { SettingKey } from '../shared/settings'
import {
  compareVersions,
  isVersion,
  LATEST_RELEASE_API,
  readRelease,
  type DownloadState,
  type UpdateFile,
  type UpdateState
} from '../shared/updates'
import { fromAppWindow } from './appWindow'
import type { SettingsStore } from './settingsStore'

/** How long after the first window opens the check on start runs. */
const START_CHECK_DELAY_MS = 5000
const CHECK_TIMEOUT_MS = 15_000
/** Download progress is sent at most this often. */
const PROGRESS_INTERVAL_MS = 250

/** The version running here; when run from the source code, FRAITUBE_VERSION can stand in for it to try the update check. */
function currentVersion(): string {
  const override = process.env['FRAITUBE_VERSION']
  return !app.isPackaged && isVersion(override) ? override : app.getVersion()
}

function sendToWindows(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, value)
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export interface UpdateService {
  /** Checks once, a few seconds from now, when Check for updates when FraiTube starts is on. */
  checkOnStart(): void
}

/**
 * Asks GitHub for the latest release, without cookies or account details, and downloads its installer
 * for this system into the Downloads folder, checked against the SHA-256 GitHub lists for it.
 */
export function registerUpdateHandlers(settings: SettingsStore): UpdateService {
  const action: DownloadState['action'] = process.platform === 'win32' ? 'install' : 'show'
  let state: UpdateState = { status: 'idle', currentVersion: currentVersion() }
  let download: DownloadState = { status: 'idle', received: 0, total: 0, action }
  let checking: Promise<UpdateState> | undefined
  let downloading: Promise<DownloadState> | undefined
  /** The downloaded and checked installer. */
  let downloadedFile: string | undefined

  function setState(next: UpdateState): void {
    state = next
    sendToWindows(IpcChannel.updateStateChanged, state)
  }

  function setDownload(next: DownloadState): void {
    download = next
    sendToWindows(IpcChannel.updateDownloadChanged, download)
  }

  async function fetchLatest(): Promise<UpdateState> {
    const version = currentVersion()
    setState({ ...state, status: 'checking', currentVersion: version, error: undefined })
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FraiTube' },
        credentials: 'omit',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      })
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}`)
      }
      const latest = readRelease(await response.json(), process.platform, process.arch)
      if (!latest) {
        throw new Error('GitHub\'s answer could not be read')
      }
      setState({ status: compareVersions(latest.version, version) > 0 ? 'available' : 'current', currentVersion: version, latest })
    } catch (cause) {
      setState({ status: 'failed', currentVersion: version, error: errorText(cause) })
    }
    return state
  }

  function check(): Promise<UpdateState> {
    checking ??= fetchLatest().finally(() => {
      checking = undefined
    })
    return checking
  }

  async function save(file: UpdateFile, version: string): Promise<DownloadState> {
    const target = join(app.getPath('downloads'), file.name)
    const partial = `${target}.part`
    setDownload({ status: 'downloading', version, received: 0, total: file.size, action })
    let lastSent = 0
    let received = 0
    const handle = await open(partial, 'w')
    try {
      const response = await fetch(file.url, { headers: { 'User-Agent': 'FraiTube' }, credentials: 'omit' })
      if (!response.ok || !response.body) {
        throw new Error(`GitHub answered ${response.status}`)
      }
      const hash = createHash('sha256')
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > file.size) {
          throw new Error('The download is bigger than GitHub said')
        }
        hash.update(value)
        await handle.write(value)
        if (Date.now() - lastSent >= PROGRESS_INTERVAL_MS) {
          lastSent = Date.now()
          setDownload({ ...download, received })
        }
      }
      await handle.close()
      if (received !== file.size || hash.digest('hex') !== file.sha256) {
        throw new Error('The downloaded file does not match the checksum GitHub lists, so it was deleted')
      }
      await rename(partial, target)
      if (process.platform !== 'win32') {
        await chmod(target, 0o755)
      }
      downloadedFile = target
      setDownload({ status: 'done', version, received, total: file.size, action })
    } catch (cause) {
      await handle.close().catch(() => undefined)
      await rm(partial, { force: true }).catch(() => undefined)
      setDownload({ status: 'failed', version, received, total: file.size, action, error: errorText(cause) })
    }
    return download
  }

  /** Downloads the installer of the newer release once; a finished download whose file is still there is kept. */
  async function startDownload(): Promise<DownloadState> {
    const latest = state.latest
    if (state.status !== 'available' || !latest?.file) {
      throw new Error('No update to download')
    }
    if (download.status === 'done' && download.version === latest.version && downloadedFile) {
      const found = await stat(downloadedFile).catch(() => undefined)
      if (found?.size === latest.file.size) {
        return download
      }
    }
    downloading ??= save(latest.file, latest.version).finally(() => {
      downloading = undefined
    })
    return downloading
  }

  ipcMain.handle(IpcChannel.updateState, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return { state, download }
  })

  ipcMain.handle(IpcChannel.checkForUpdates, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return check()
  })

  ipcMain.handle(IpcChannel.downloadUpdate, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return startDownload()
  })

  // On Windows the installer opens and FraiTube closes, so the installer can replace it; on Linux the
  // AppImage shows in its folder.
  ipcMain.handle(IpcChannel.installUpdate, async (event) => {
    if (!fromAppWindow(event) || download.status !== 'done' || !downloadedFile) {
      throw new Error('Request refused')
    }
    if (action === 'show') {
      shell.showItemInFolder(downloadedFile)
      return
    }
    const failure = await shell.openPath(downloadedFile)
    if (failure) {
      throw new Error(failure)
    }
    app.quit()
  })

  return {
    checkOnStart() {
      if (settings.get(SettingKey.checkUpdates) !== false) {
        setTimeout(() => void check(), START_CHECK_DELAY_MS)
      }
    }
  }
}
