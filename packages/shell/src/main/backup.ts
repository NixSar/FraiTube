import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  backupFileName,
  checkManifest,
  createBackup,
  readBackup,
  removeDatabaseFiles,
  replaceDatabase,
  writeRestoredDatabase
} from '@fraitube/backup'
import type { ModuleSchema, Storage } from '@fraitube/storage'
import type { BackupStatus } from '../shared/backupSettings'
import { IpcChannel } from '../shared/bridge'
import { fromAppWindow } from './appWindow'
import { appImageFile } from './relaunch'
import { loadSevenZip } from './sevenZip'

/** Largest backup file read. */
export const MAX_BACKUP_FILE_BYTES = 2 * 1024 * 1024 * 1024

/** Tables that belong to this computer and stay as they are when a backup is restored. */
const KEPT_TABLES = ['local_settings']
/** Tables emptied when a backup is restored, so the next sync starts fresh. */
const CLEARED_TABLES = ['sync_versions', 'sync_read_files']

export interface BackupServiceOptions {
  storage: Storage
  schemas: readonly ModuleSchema[]
  /** The database file of this computer. */
  databaseFile: string
  /** Closes the database before the restored one takes its place. */
  closeStorage: () => void
}

function sendToWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args)
  }
}

export function registerBackupHandlers(options: BackupServiceOptions): void {
  const status: BackupStatus = { working: false }

  function update(change: Partial<BackupStatus>): void {
    Object.assign(status, change)
    sendToWindows(IpcChannel.backupStatusChanged, { ...status })
  }

  async function guarded(action: 'backup' | 'restore', work: () => Promise<string | undefined>): Promise<BackupStatus> {
    if (status.working) {
      throw new Error('A backup or restore is already running')
    }
    update({ working: true })
    try {
      const file = await work()
      if (file) {
        update({ lastAction: action, at: Date.now(), file, error: undefined })
      }
    } catch (error) {
      update({ lastAction: action, at: Date.now(), error: error instanceof Error ? error.message : String(error) })
    } finally {
      update({ working: false })
    }
    return { ...status }
  }

  ipcMain.handle(IpcChannel.backupStatus, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    return { ...status }
  })

  ipcMain.handle(IpcChannel.createBackup, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    return guarded('backup', async () => {
      const dialogOptions: Electron.SaveDialogOptions = {
        title: 'Save backup',
        defaultPath: `${app.getPath('documents')}/${backupFileName(new Date())}`,
        filters: [{ name: '7z archive', extensions: ['7z'] }]
      }
      const choice = window ? await dialog.showSaveDialog(window, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
      if (choice.canceled || !choice.filePath) {
        return undefined
      }
      const archive = await createBackup({
        db: options.storage.db,
        appVersion: app.getVersion(),
        tempFolder: app.getPath('temp'),
        loadSevenZip
      })
      await writeFile(choice.filePath, archive)
      return choice.filePath
    })
  })

  ipcMain.handle(IpcChannel.restoreBackup, (event) => {
    if (!fromAppWindow(event)) {
      throw new Error('Request refused')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    return guarded('restore', async () => {
      const openOptions: Electron.OpenDialogOptions = {
        title: 'Restore backup',
        properties: ['openFile'],
        filters: [{ name: 'FraiTube backup', extensions: ['7z'] }]
      }
      const choice = window ? await dialog.showOpenDialog(window, openOptions) : await dialog.showOpenDialog(openOptions)
      const file = choice.filePaths[0]
      if (choice.canceled || !file) {
        return undefined
      }
      if ((await stat(file)).size > MAX_BACKUP_FILE_BYTES) {
        throw new Error('The file is larger than 2 GB')
      }
      const { manifest, database } = await readBackup(new Uint8Array(await readFile(file)), loadSevenZip)
      checkManifest(manifest, options.schemas)

      const confirmOptions: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Restore backup',
        message: `Restore the backup from ${new Date(manifest.createdAt).toLocaleString()}?`,
        detail: 'Subscriptions, history and synced settings are replaced by the backup\'s. This computer keeps its own local settings. FraiTube restarts.',
        buttons: ['Restore', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      }
      const answer = window ? await dialog.showMessageBox(window, confirmOptions) : await dialog.showMessageBox(confirmOptions)
      if (answer.response !== 0) {
        return undefined
      }

      const restored = `${options.databaseFile}.restore`
      const previous = `${options.databaseFile}.before-restore`
      await removeDatabaseFiles(restored)
      await writeRestoredDatabase(restored, database, {
        computerId: options.storage.computerId,
        currentDb: options.storage.db,
        keepTables: KEPT_TABLES,
        clearTables: CLEARED_TABLES
      })

      // The current database is kept next to it, and the restored one takes its place. The database
      // is closed from here on, so the app restarts either way; after a failure, with the data it had.
      options.closeStorage()
      try {
        await replaceDatabase(options.databaseFile, restored, previous)
      } catch {
        dialog.showErrorBox('Restore backup', 'The backup could not be restored. FraiTube restarts with the data it had.')
      }
      // The new process takes over as the one FraiTube process.
      app.releaseSingleInstanceLock()
      const appImage = appImageFile(process.env)
      if (appImage) {
        spawn(appImage, process.argv.slice(1), { detached: true, stdio: 'ignore' }).unref()
      } else {
        app.relaunch()
      }
      app.exit(0)
      return file
    })
  })
}
