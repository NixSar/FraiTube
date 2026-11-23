import { BrowserWindow, ipcMain, screen, type BrowserWindowConstructorOptions } from 'electron'
import { isVideoId } from '@fraitube/youtube/ids'
import { IpcChannel } from '../shared/bridge'
import { isHistorySeconds } from '../shared/history'
import { PIP_ASPECT_RATIO, PIP_MIN_SIZE, pipBounds, pipPath, subtitlesFrom, watchPath, type HandOver } from '../shared/pip'
import { fromAppWindow } from './appWindow'
import { createHandOverRequests } from './handOver'

export interface PipWindowFactory {
  /** Makes an app window with the given options, showing the in-app path. */
  create(path: string, options: BrowserWindowConstructorOptions): BrowserWindow
  /** Shows another in-app path in a window made by create. */
  load(window: BrowserWindow, path: string): void
  /** Opens a normal app window at the in-app path. */
  openAppWindow(path: string): void
}

/** The one PiP window, and the app window whose video it plays. */
let pip: { window: BrowserWindow; openerId: number } | undefined

/** The PiP window, while one is open. */
export function pipWindow(): BrowserWindow | undefined {
  return pip && !pip.window.isDestroyed() ? pip.window : undefined
}

/** Closes the PiP window once no app window is left, so the app can quit. */
export function closePipWithoutAppWindows(): void {
  const window = pipWindow()
  if (window && BrowserWindow.getAllWindows().every((other) => other === window || other.isDestroyed())) {
    window.close()
  }
}

function fromPipWindow(event: Electron.IpcMainEvent): boolean {
  const window = pipWindow()
  return window !== undefined && event.sender === window.webContents
}

/**
 * The PiP window: one window on top of the others that plays the video an app window left,
 * opening in the lower right corner of the screen, moved and resized freely in the video's shape.
 */
export function registerPipHandlers(factory: PipWindowFactory): void {
  const handOver = createHandOverRequests()

  function askToHandOver(window: BrowserWindow): Promise<HandOver | undefined> {
    return handOver.ask({
      id: window.webContents.id,
      send: (requestId) => window.webContents.send(IpcChannel.handOverRequested, requestId)
    })
  }

  ipcMain.on(IpcChannel.handedOver, (event, requestId: unknown, given: unknown) => {
    handOver.answer(event.sender.id, requestId, given)
  })

  // A video moving between an app window and the PiP window: the player that has buffered it takes
  // over from the one still playing it. The PiP window closes once its video moved back.
  ipcMain.handle(IpcChannel.takeOverPlayback, async (event): Promise<HandOver | undefined> => {
    const window = pipWindow()
    if (!pip || !window) {
      return undefined
    }
    if (event.sender === window.webContents) {
      const opener = BrowserWindow.fromId(pip.openerId)
      return opener && !opener.isDestroyed() ? askToHandOver(opener) : undefined
    }
    if (fromAppWindow(event) && BrowserWindow.fromWebContents(event.sender)?.id === pip.openerId) {
      const given = await askToHandOver(window)
      if (!window.isDestroyed()) {
        window.close()
      }
      return given
    }
    return undefined
  })

  ipcMain.on(IpcChannel.openPip, (event, videoId: unknown, seconds: unknown, subtitles: unknown) => {
    const opener = BrowserWindow.fromWebContents(event.sender)
    if (!fromAppWindow(event) || !opener || opener === pipWindow() || !isVideoId(videoId) || !isHistorySeconds(seconds)) {
      return
    }
    const path = pipPath(videoId, seconds, subtitlesFrom(subtitles))
    const open = pipWindow()
    if (open) {
      pip = { window: open, openerId: opener.id }
      factory.load(open, path)
    } else {
      const bounds = pipBounds(screen.getDisplayMatching(opener.getBounds()).workArea)
      const window = factory.create(path, {
        ...bounds,
        minWidth: PIP_MIN_SIZE.width,
        minHeight: PIP_MIN_SIZE.height,
        frame: false,
        resizable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        backgroundColor: '#000000'
      })
      window.setAspectRatio(PIP_ASPECT_RATIO)
      window.on('closed', () => {
        if (pip?.window === window) {
          const opener = BrowserWindow.fromId(pip.openerId)
          pip = undefined
          // A video the opener still plays out of sight, waiting for the PiP window, stops with it.
          if (opener && !opener.isDestroyed()) {
            void askToHandOver(opener)
          }
        }
      })
      pip = { window, openerId: opener.id }
    }
    // Only one video plays at a time. The opener's video plays on until the PiP window takes over.
    for (const window of BrowserWindow.getAllWindows()) {
      if (window !== pipWindow() && window !== opener) {
        window.webContents.send(IpcChannel.pausePlayback)
      }
    }
  })

  ipcMain.on(IpcChannel.closePip, (event) => {
    if (fromAppWindow(event)) {
      pipWindow()?.close()
    }
  })

  ipcMain.on(IpcChannel.pipBack, (event, videoId: unknown, seconds: unknown, passed: unknown) => {
    if (!fromPipWindow(event) || !pip || !isVideoId(videoId) || !isHistorySeconds(seconds)) {
      return
    }
    const subtitles = subtitlesFrom(passed)
    const opener = BrowserWindow.fromId(pip.openerId)
    if (opener && !opener.isDestroyed()) {
      if (opener.isMinimized()) {
        opener.restore()
      }
      opener.focus()
      // The PiP window plays on until the watch page has the video buffered and takes over.
      opener.webContents.send(IpcChannel.pipReturned, videoId, seconds, subtitles)
    } else {
      factory.openAppWindow(watchPath(videoId, seconds, subtitles))
      pip.window.close()
    }
  })

  ipcMain.on(IpcChannel.movePip, (event, dx: unknown, dy: unknown) => {
    const window = pipWindow()
    if (!window || !fromPipWindow(event) || typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) {
      return
    }
    const [x = 0, y = 0] = window.getPosition()
    window.setPosition(Math.round(x + dx), Math.round(y + dy))
  })
}
