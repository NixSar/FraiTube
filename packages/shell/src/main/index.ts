import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, screen, shell, type BrowserWindowConstructorOptions, type Rectangle } from 'electron'
import type { WindowBounds } from '@fraitube/app-api/settings'
import { openStorage, syncedTables, type ModuleSchema, type Storage } from '@fraitube/storage'
import { syncSchema } from '@fraitube/sync'
import { IpcChannel, isAppPath } from '../shared/bridge'
import { staysOnPage } from '../shared/navigation'
import { allSettingDefinitions, SettingKey } from '../shared/settings'
import { registerBackupHandlers } from './backup'
import { registerNetworkHandlers } from './net'
import { closePipWithoutAppWindows, registerPipHandlers } from './pip'
import { registerSettingsHandlers } from './settings'
import { createSettingsStore, settingsSchema, type SettingsStore } from './settingsStore'
import { createFeedService } from './feed'
import { registerHistoryHandlers } from './history'
import { createHistoryStore, historySchema } from './historyStore'
import { registerSponsorBlockHandlers } from './sponsorBlock'
import { announceFeedProgress, registerSubscriptionHandlers } from './subscriptions'
import { registerSyncHandlers, type SyncService } from './sync'
import { createSubscriptionsStore, subscriptionsSchema } from './subscriptionsStore'
import { DEFAULT_WINDOW_SIZE, fitWindowSize, MIN_WINDOW_SIZE } from './windowSize'
import appIcon from '../../build/icon.png?asset'

// The name sets the user data folder, where this computer's database lives.
app.setName('FraiTube')

/** Tables of every installed module, as numbered upgrade steps. */
const schemas: ModuleSchema[] = [settingsSchema, subscriptionsSchema, historySchema, syncSchema]
let storage: Storage | undefined
let settings: SettingsStore | undefined
let sync: SyncService | undefined
/** True once the sync before quitting has run, so the next quit goes ahead. */
let syncedBeforeQuit = false

// Present a plain Chrome user agent, without the Electron and app tokens.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|fraitube|@fraitube\/shell)\/\S+/gi, '')

/** Smallest part of a window, in pixels, that must be on a screen for a saved position to be reused. */
const MIN_VISIBLE = 100

function isOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return width >= MIN_VISIBLE && height >= MIN_VISIBLE
  })
}

/**
 * The saved size for every window, kept within the minimum and the screen, and the saved position
 * for the first one when it is still on a screen.
 */
function initialBounds(): { bounds: Partial<Rectangle>; maximized: boolean } {
  const saved = settings?.get(SettingKey.windowBounds) as WindowBounds | undefined
  if (!saved) {
    return { bounds: fitWindowSize(DEFAULT_WINDOW_SIZE, screen.getPrimaryDisplay().workAreaSize), maximized: false }
  }
  let workArea = screen.getPrimaryDisplay().workArea
  let position: { x: number; y: number } | undefined
  if (BrowserWindow.getAllWindows().length === 0 && saved.x !== undefined && saved.y !== undefined) {
    const rectangle = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    if (isOnScreen(rectangle)) {
      position = { x: saved.x, y: saved.y }
      workArea = screen.getDisplayMatching(rectangle).workArea
    }
  }
  return { bounds: { ...fitWindowSize(saved, workArea), ...position }, maximized: saved.maximized }
}

/** Shows an in-app path, for example "/subscriptions", in an app window. */
function loadAppPath(window: BrowserWindow, path: string): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(`${devServerUrl}#${path}`)
  } else {
    void window.loadFile(join(__dirname, '..', 'renderer', 'index.html'), { hash: path })
  }
}

/** A window that shows the app at the path, with the app's icon, bridge and rules for links. */
function makeAppWindow(path: string, options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Links to outside sites open in the system browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // The window only ever shows the app's own page, never a file dropped on it or another address.
  window.webContents.on('will-navigate', (event, url) => {
    if (!staysOnPage(url, window.webContents.getURL())) {
      event.preventDefault()
    }
  })

  loadAppPath(window, path)
  return window
}

function createWindow(path = '/'): BrowserWindow {
  const { bounds, maximized } = initialBounds()
  const window = makeAppWindow(path, {
    ...bounds,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height
  })

  window.once('ready-to-show', () => {
    if (maximized) {
      window.maximize()
    }
    window.show()
  })

  // The window that closes last leaves its size and position for the next start.
  window.on('close', () => {
    const { x, y, width, height } = window.getNormalBounds()
    settings?.set(SettingKey.windowBounds, { x, y, width, height, maximized: window.isMaximized() })
  })
  window.on('closed', closePipWithoutAppWindows)

  return window
}

/** The PiP window shows without taking the focus from the app window. */
function createPipWindow(path: string, options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = makeAppWindow(path, options)
  window.once('ready-to-show', () => {
    window.showInactive()
  })
  return window
}

ipcMain.on(IpcChannel.openWindow, (_event, path: unknown) => {
  if (isAppPath(path)) {
    createWindow(path)
  }
})

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const databaseFile = join(app.getPath('userData'), 'fraitube.db')
  storage = openStorage(databaseFile, schemas)
  settings = createSettingsStore(storage, allSettingDefinitions())
  registerSettingsHandlers(settings)
  const youtube = registerNetworkHandlers(app.userAgentFallback)
  const feed = createFeedService(async (url) => {
    const response = await youtube.fetch(url)
    return { status: response.status, text: response.status === 200 ? await response.text() : '' }
  }, Date.now, announceFeedProgress)
  registerSubscriptionHandlers(createSubscriptionsStore(storage), feed, youtube.getChannelIcon)
  registerHistoryHandlers(createHistoryStore(storage))
  registerSponsorBlockHandlers(settings, app.userAgentFallback)
  registerPipHandlers({ create: createPipWindow, load: loadAppPath, openAppWindow: createWindow })
  createWindow()
  sync = registerSyncHandlers({
    storage,
    settings,
    tables: syncedTables(schemas),
    stagingFolder: join(app.getPath('userData'), 'sync-staging')
  })
  registerBackupHandlers({
    storage,
    schemas,
    databaseFile,
    closeStorage
  })
})

function closeStorage(): void {
  settings = undefined
  storage?.close()
  storage = undefined
}

// Quitting waits for one last sync, so this computer's latest changes reach the others. The app
// quits when its last window closes, so the last video position is saved by then.
app.on('before-quit', (event) => {
  if (syncedBeforeQuit || !sync) {
    return
  }
  event.preventDefault()
  syncedBeforeQuit = true
  void sync.syncBeforeQuit().then(() => {
    app.quit()
  })
})

app.on('will-quit', closeStorage)

app.on('window-all-closed', () => {
  app.quit()
})
