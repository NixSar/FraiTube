import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { isChannel, isChannelId, parseSubscriptionsFile } from '@fraitube/subscriptions'
import type { ImportSummary } from '@fraitube/subscriptions/types'
import { IpcChannel, type FeedProgress } from '../shared/bridge'
import { fromAppWindow } from './appWindow'
import { createIconFiller } from './channelIcons'
import type { FeedService } from './feed'
import type { SubscriptionsStore } from './subscriptionsStore'

/** Largest subscriptions file read. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024

function announceChange(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.subscriptionsChanged)
  }
}

/** Sends the videos fetched so far to every window, so any open New videos page shows them. */
export function announceFeedProgress(progress: FeedProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.feedProgress, progress)
  }
}

/** Registers the subscription handlers and starts fetching the icons subscriptions are missing. */
export function registerSubscriptionHandlers(store: SubscriptionsStore, feed: FeedService, fetchIcon: (channelId: string) => Promise<string>): void {
  const icons = createIconFiller({
    missing: () => store.missingAvatars(),
    fetchIcon,
    save: (channelId, avatar) => store.setAvatar(channelId, avatar),
    announce: announceChange
  })
  const fillIcons = (): void => {
    void icons.fill()
  }
  fillIcons()

  ipcMain.handle(IpcChannel.listSubscriptions, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return store.list()
  })

  ipcMain.handle(IpcChannel.subscribe, (event, channel: unknown) => {
    if (!fromAppWindow(event) || !isChannel(channel)) {
      throw new Error('Request refused')
    }
    store.subscribe({ id: channel.id, name: channel.name, avatar: channel.avatar })
    announceChange()
    fillIcons()
  })

  ipcMain.handle(IpcChannel.unsubscribe, (event, channelId: unknown) => {
    if (!fromAppWindow(event) || !isChannelId(channelId)) {
      throw new Error('Request refused')
    }
    store.unsubscribe(channelId)
    feed.keepOnly(store.list())
    announceChange()
  })

  ipcMain.handle(IpcChannel.clearSubscriptions, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    store.clear()
    feed.keepOnly(store.list())
    announceChange()
  })

  ipcMain.handle(IpcChannel.importSubscriptions, async (event): Promise<ImportSummary | undefined> => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Import subscriptions',
      properties: ['openFile'],
      filters: [{ name: 'FreeTube or NewPipe subscriptions', extensions: ['db', 'json'] }]
    }
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = choice.filePaths[0]
    if (choice.canceled || !file) {
      return undefined
    }
    if ((await stat(file)).size > MAX_IMPORT_FILE_BYTES) {
      throw new Error('The file is larger than 10 MB')
    }
    const { format, channels } = parseSubscriptionsFile(basename(file), await readFile(file, 'utf8'))
    const summary = store.import(channels, format)
    announceChange()
    fillIcons()
    return summary
  })

  ipcMain.handle(IpcChannel.feed, (event, refresh: unknown) => {
    if (!fromAppWindow(event) || typeof refresh !== 'boolean') {
      throw new Error('Request refused')
    }
    return feed.get(store.list(), refresh)
  })
}
