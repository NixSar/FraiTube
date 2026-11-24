import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel } from '../shared/bridge'
import { isSearchQuery, SearchHistorySettingKey, searchesKept } from '../shared/searchHistory'
import { fromAppWindow } from './appWindow'
import type { SearchHistoryStore } from './searchHistoryStore'
import type { SettingsStore } from './settingsStore'

export function announceSearchHistoryChange(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.searchHistoryChanged)
  }
}

/** Searches are saved only while Remember searches is on, and kept up to the chosen number. */
export function registerSearchHistoryHandlers(store: SearchHistoryStore, settings: SettingsStore): void {
  const kept = (): number => searchesKept(settings.get(SearchHistorySettingKey.kept))

  ipcMain.handle(IpcChannel.listSearchHistory, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return store.list(kept())
  })

  ipcMain.handle(IpcChannel.addSearch, (event, query: unknown) => {
    if (!fromAppWindow(event) || !isSearchQuery(query)) {
      throw new Error('Request refused')
    }
    if (settings.get(SearchHistorySettingKey.remember) !== false) {
      store.add(query, kept())
      announceSearchHistoryChange()
    }
  })

  ipcMain.handle(IpcChannel.removeSearch, (event, query: unknown) => {
    if (!fromAppWindow(event) || !isSearchQuery(query)) {
      throw new Error('Request refused')
    }
    store.remove(query)
    announceSearchHistoryChange()
  })

  ipcMain.handle(IpcChannel.clearSearchHistory, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    store.clear()
    announceSearchHistoryChange()
  })
}
