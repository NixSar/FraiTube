import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel } from '../shared/bridge'
import { fromAppWindow } from './appWindow'
import type { SettingsStore } from './settingsStore'

export function registerSettingsHandlers(store: SettingsStore): void {
  ipcMain.handle(IpcChannel.getSettings, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return store.getAll()
  })

  ipcMain.handle(IpcChannel.setSetting, (event, key: unknown, value: unknown) => {
    if (!fromAppWindow(event) || typeof key !== 'string') {
      throw new Error('Request refused')
    }
    const saved = store.set(key, value)
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannel.settingChanged, key, saved)
    }
  })
}
