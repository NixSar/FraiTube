import { BrowserWindow, ipcMain } from 'electron'
import { isVideoId } from '@fraitube/youtube/ids'
import { IpcChannel } from '../shared/bridge'
import { isHistoryVideo } from '../shared/history'
import { fromAppWindow } from './appWindow'
import type { FavoritesStore } from './favoritesStore'

function announceChange(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.favoritesChanged)
  }
}

export function registerFavoritesHandlers(store: FavoritesStore): void {
  ipcMain.handle(IpcChannel.listFavorites, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return store.list()
  })

  ipcMain.handle(IpcChannel.addFavorite, (event, video: unknown) => {
    if (!fromAppWindow(event) || !isHistoryVideo(video)) {
      throw new Error('Request refused')
    }
    store.add(video)
    announceChange()
  })

  ipcMain.handle(IpcChannel.removeFavorite, (event, videoId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    store.remove(videoId)
    announceChange()
  })
}
