import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { isVideoId } from '@fraitube/youtube/ids'
import { IpcChannel } from '../shared/bridge'
import { isHistorySeconds, isHistoryVideo, type HistoryImportSummary } from '../shared/history'
import { fromAppWindow } from './appWindow'
import { checkHistoryFileSize, historyFileFormat, parseFreeTubeHistory, readNewPipeBackup } from './historyImport'
import type { HistoryStore } from './historyStore'

function announceChange(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.historyChanged)
  }
}

export function registerHistoryHandlers(store: HistoryStore): void {
  ipcMain.handle(IpcChannel.listHistory, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return store.list()
  })

  ipcMain.handle(IpcChannel.recordHistory, (event, video: unknown) => {
    if (!fromAppWindow(event) || !isHistoryVideo(video)) {
      throw new Error('Request refused')
    }
    const entry = store.record(video)
    announceChange()
    return entry
  })

  // Sent without waiting for an answer, so it still arrives while a window closes.
  ipcMain.on(IpcChannel.saveHistoryPosition, (event, videoId: unknown, positionSeconds: unknown) => {
    if (fromAppWindow(event) && isVideoId(videoId) && isHistorySeconds(positionSeconds) && store.savePosition(videoId, positionSeconds)) {
      // Only the one position, so windows update that video's progress without loading the whole history.
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IpcChannel.historyPositionSaved, videoId, positionSeconds)
      }
    }
  })

  ipcMain.handle(IpcChannel.removeHistory, (event, videoId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    store.remove(videoId)
    announceChange()
  })

  ipcMain.handle(IpcChannel.markWatched, (event, video: unknown) => {
    if (!fromAppWindow(event) || !isHistoryVideo(video)) {
      throw new Error('Request refused')
    }
    store.markWatched(video)
    announceChange()
  })

  ipcMain.handle(IpcChannel.markUnwatched, (event, videoId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    store.markUnwatched(videoId)
    announceChange()
  })

  ipcMain.handle(IpcChannel.clearHistory, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    store.clear()
    announceChange()
  })

  ipcMain.handle(IpcChannel.importHistory, async (event): Promise<HistoryImportSummary | undefined> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Import watch history',
      properties: ['openFile'],
      filters: [{ name: 'FreeTube history or NewPipe backup', extensions: ['db', 'zip'] }]
    }
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = choice.filePaths[0]
    if (choice.canceled || !file) {
      return undefined
    }
    const format = historyFileFormat(basename(file))
    checkHistoryFileSize((await stat(file)).size)
    const entries = format === 'freetube'
      ? parseFreeTubeHistory(await readFile(file, 'utf8'))
      : await readNewPipeBackup(new Uint8Array(await readFile(file)), app.getPath('temp'))
    const summary = store.import(entries, format)
    announceChange()
    return summary
  })
}
