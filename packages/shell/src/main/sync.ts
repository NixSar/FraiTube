import { rm } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { Storage } from '@fraitube/storage'
import {
  createSyncEngine,
  findRclone,
  isRcloneProgram,
  listRemotes,
  resetSyncState,
  syncWithFolder,
  syncWithRclone,
  syncWithWebdav,
  type SyncResult
} from '@fraitube/sync'
import { IpcChannel } from '../shared/bridge'
import { isSyncMode, MAX_SYNC_PATH_LENGTH, MAX_WEBDAV_TEXT_LENGTH, syncPlace, SyncSettingKey, type RcloneRemotes, type SyncStatus } from '../shared/syncSettings'
import type { WebdavPasswordStore } from './webdavPassword'
import { fromAppWindow } from './appWindow'
import type { SettingsStore } from './settingsStore'
import { afterSearch, syncBeforeQuit } from './syncTiming'

/** How often the timer checks whether a sync is due. */
const CHECK_MS = 60_000

export interface SyncServiceOptions {
  storage: Storage
  settings: SettingsStore
  /** The record tables that sync. */
  tables: readonly string[]
  /** A local folder that mirrors the rclone remote or the WebDAV server. */
  stagingFolder: string
  /** Where the WebDAV password is kept, encrypted and outside the database. */
  webdavPassword: WebdavPasswordStore
  now?: () => number
}

function sendToWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args)
  }
}

export interface SyncService {
  /** One last sync before the app quits, or joins the one running; done at once while sync is off, and after 30 seconds at most. */
  syncBeforeQuit(): Promise<void>
}

export function registerSyncHandlers(options: SyncServiceOptions): SyncService {
  const { settings, storage } = options
  const now = options.now ?? Date.now
  const engine = createSyncEngine({ storage, tables: options.tables, now })
  let running: Promise<SyncStatus> | undefined
  let lastAttemptAt: number | undefined
  const status: SyncStatus = { mode: 'off', running: false, sent: 0, received: 0, computers: 0, unreadable: 0 }

  function currentStatus(): SyncStatus {
    const mode = settings.get(SyncSettingKey.mode)
    return { ...status, mode: isSyncMode(mode) ? mode : 'off' }
  }

  /** Tells every window what the merge changed. */
  function announce(result: SyncResult): void {
    for (const key of result.changedKeys['settings'] ?? []) {
      try {
        sendToWindows(IpcChannel.settingChanged, key, settings.get(key))
      } catch {
        // A setting of a module this computer does not have.
      }
    }
    if (result.changedKeys['subscriptions']) {
      sendToWindows(IpcChannel.subscriptionsChanged)
    }
    if (result.changedKeys['history']) {
      sendToWindows(IpcChannel.historyChanged)
    }
    if (result.changedKeys['search_history']) {
      sendToWindows(IpcChannel.searchHistoryChanged)
    }
  }

  /**
   * A changed sync place holds nothing of this computer yet, so what was sent and read is forgotten
   * and the next run sends everything there. The first sync ever only notes the place.
   */
  async function noteSyncPlace(mode: SyncStatus['mode']): Promise<void> {
    const place = syncPlace(mode, (key) => String(settings.get(key)))
    const last = String(settings.get(SyncSettingKey.place))
    if (place === '' || place === last) {
      return
    }
    if (last !== '') {
      resetSyncState(storage)
      await rm(options.stagingFolder, { recursive: true, force: true })
    }
    settings.set(SyncSettingKey.place, place)
  }

  async function syncOnce(): Promise<SyncResult | undefined> {
    const mode = currentStatus().mode
    await noteSyncPlace(mode)
    if (mode === 'folder') {
      return syncWithFolder(engine, String(settings.get(SyncSettingKey.folder)))
    }
    if (mode === 'rclone') {
      return syncWithRclone(engine, {
        program: String(settings.get(SyncSettingKey.rcloneProgram)),
        remoteName: String(settings.get(SyncSettingKey.rcloneRemote)),
        staging: options.stagingFolder,
        computerId: storage.computerId
      })
    }
    if (mode === 'webdav') {
      const address = String(settings.get(SyncSettingKey.webdavAddress))
      const user = String(settings.get(SyncSettingKey.webdavUser))
      if (address === '') {
        throw new Error('Enter the WebDAV address')
      }
      // A user name without the password saved for this very address is not sent anywhere.
      const password = await options.webdavPassword.forAddress(address)
      if (password === undefined && user !== '') {
        throw new Error('Enter the WebDAV password for this address')
      }
      return syncWithWebdav(engine, { address, user, password: password ?? '', staging: options.stagingFolder, computerId: storage.computerId })
    }
    return undefined
  }

  /** Runs one sync, or joins the one already running. */
  function run(): Promise<SyncStatus> {
    running ??= (async () => {
      lastAttemptAt = now()
      status.running = true
      sendToWindows(IpcChannel.syncStatusChanged, currentStatus())
      try {
        const result = await syncOnce()
        if (result) {
          Object.assign(status, {
            sent: result.sent,
            received: result.received,
            computers: result.computers,
            unreadable: result.unreadable,
            lastError: result.unreadable > 0 ? `${result.unreadable} files of other computers could not be read yet` : undefined
          })
          announce(result)
        } else {
          status.lastError = undefined
        }
      } catch (error) {
        status.lastError = error instanceof Error ? error.message : String(error)
      } finally {
        status.running = false
        status.lastSyncAt = now()
        running = undefined
      }
      const finished = currentStatus()
      sendToWindows(IpcChannel.syncStatusChanged, finished)
      return finished
    })()
    return running
  }

  function isDue(): boolean {
    if (currentStatus().mode === 'off') {
      return false
    }
    const minutes = Number(settings.get(SyncSettingKey.interval))
    return lastAttemptAt === undefined || now() - lastAttemptAt >= minutes * 60_000
  }

  ipcMain.handle(IpcChannel.syncStatus, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return currentStatus()
  })

  ipcMain.handle(IpcChannel.syncNow, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return run()
  })

  ipcMain.handle(IpcChannel.chooseSyncFolder, async (event): Promise<string | undefined> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = { title: 'Choose the sync folder', properties: ['openDirectory', 'createDirectory'] }
    const choice = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions)
    const folder = choice.filePaths[0]
    if (choice.canceled || !folder) {
      return undefined
    }
    if (folder.length > MAX_SYNC_PATH_LENGTH) {
      throw new Error('The folder path is too long')
    }
    sendToWindows(IpcChannel.settingChanged, SyncSettingKey.folder, settings.set(SyncSettingKey.folder, folder))
    return folder
  })

  ipcMain.handle(IpcChannel.chooseRcloneProgram, async (event): Promise<string | undefined> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Choose the rclone executable',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'rclone', extensions: ['exe'] }] : []
    }
    const choice = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions)
    const file = choice.filePaths[0]
    if (choice.canceled || !file) {
      return undefined
    }
    if (!isRcloneProgram(file)) {
      throw new Error('That is not a usable rclone path')
    }
    sendToWindows(IpcChannel.settingChanged, SyncSettingKey.rcloneProgram, settings.set(SyncSettingKey.rcloneProgram, file))
    return file
  })

  ipcMain.handle(IpcChannel.rcloneRemotes, async (event): Promise<RcloneRemotes> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    try {
      return { remotes: await listRemotes(String(settings.get(SyncSettingKey.rcloneProgram))) }
    } catch (error) {
      return { remotes: [], error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IpcChannel.webdavHasPassword, async (event): Promise<boolean> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return await options.webdavPassword.forAddress(String(settings.get(SyncSettingKey.webdavAddress))) !== undefined
  })

  ipcMain.handle(IpcChannel.webdavSetPassword, async (event, password: unknown): Promise<void> => {
    if (!fromAppWindow(event) || typeof password !== 'string' || password.length > MAX_WEBDAV_TEXT_LENGTH) {
      throw new Error('Request refused')
    }
    // The password is saved for the address set now; a later change of address needs it again.
    await options.webdavPassword.set(String(settings.get(SyncSettingKey.webdavAddress)), password)
  })

  // When no rclone executable is set yet and rclone is on the PATH, its full path is filled in.
  const detected = settings.get(SyncSettingKey.rcloneProgram) === ''
    ? findRclone(process.env['PATH'], process.platform)
    : Promise.resolve(undefined)
  const searched = detected.then((file) => {
    if (file && settings.get(SyncSettingKey.rcloneProgram) === '' && file.length <= MAX_SYNC_PATH_LENGTH) {
      sendToWindows(IpcChannel.settingChanged, SyncSettingKey.rcloneProgram, settings.set(SyncSettingKey.rcloneProgram, file))
    }
  })

  // A sync on start, once the search for rclone is done, then whenever the chosen interval has passed.
  void afterSearch(searched, () => {
    if (isDue()) {
      void run()
    }
  })
  setInterval(() => {
    if (isDue()) {
      void run()
    }
  }, CHECK_MS)

  return {
    syncBeforeQuit() {
      return syncBeforeQuit(currentStatus().mode !== 'off', run)
    }
  }
}
