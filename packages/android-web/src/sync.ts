import type { Storage } from '@fraitube/storage'
import { createSyncEngine } from '../../sync/src/engine'
import { SYNC_ROOT_FOLDER } from '../../sync/src/format'
import type { SyncResult } from '../../sync/src/types'
import type { SettingsStore } from '../../shell/src/main/settingsStore'
import { isSyncMode, SyncSettingKey, type SyncStatus } from '../../shell/src/shared/syncSettings'
import { awaitNative } from './hiddenCalls'
import type { AppNative } from './native'

/** How often the timer checks whether a sync is due. */
const CHECK_MS = 60_000

export interface SyncServiceOptions {
  native: AppNative
  storage: Storage
  settings: SettingsStore
  /** The record tables that sync. */
  tables: readonly string[]
  /** True while one of Android's pickers, opened by the app, covers the page. */
  pickerOpen(): boolean
  /** Tells the pages that the sync status changed. */
  announceStatus(status: SyncStatus): void
  /** Tells the pages what a merge changed: the changed keys of each table. */
  announceChanges(changedKeys: SyncResult['changedKeys']): void
  now?: () => number
}

export interface SyncService {
  status(): SyncStatus
  /** Runs one sync, or joins the one already running. */
  run(): Promise<SyncStatus>
  /** Starts the timing: a sync on start, at the chosen interval, and whenever the app is left. */
  start(): void
}

/**
 * Sync on the phone, with the desktop's sync engine. The engine works in the app's private sync
 * folder; before it runs the other computers' files are copied in from the picked folder or the WebDAV
 * server, and afterwards this phone's files are copied out.
 */
export function createSyncService(options: SyncServiceOptions): SyncService {
  const { native, settings, storage } = options
  const now = options.now ?? Date.now
  const engine = createSyncEngine({ storage, tables: options.tables, now })
  let running: Promise<SyncStatus> | undefined
  let lastAttemptAt: number | undefined
  const status: SyncStatus = { mode: 'off', running: false, sent: 0, received: 0, computers: 0, unreadable: 0 }

  function currentStatus(): SyncStatus {
    const mode = settings.get(SyncSettingKey.mode)
    return { ...status, mode: isSyncMode(mode) ? mode : 'off' }
  }

  function transfer(direction: 'pull' | 'push', details: string): Promise<string> {
    return awaitNative((callId) => native.syncTransfer(callId, direction, details))
  }

  async function syncOnce(): Promise<SyncResult | undefined> {
    const mode = currentStatus().mode
    if (mode !== 'folder' && mode !== 'webdav') {
      return undefined
    }
    if (mode === 'folder' && settings.get(SyncSettingKey.folder) === '') {
      throw new Error('Choose a sync folder')
    }
    const address = String(settings.get(SyncSettingKey.webdavAddress))
    if (mode === 'webdav' && address === '') {
      throw new Error('Enter the WebDAV address')
    }
    const details = JSON.stringify({ mode, computerId: storage.computerId, address, user: String(settings.get(SyncSettingKey.webdavUser)) })
    await transfer('pull', details)
    try {
      return await engine.run(SYNC_ROOT_FOLDER)
    } finally {
      // The engine writes this phone's file and marks its changes as sent before it reads the other
      // computers' files, so the copy out happens also when that reading fails.
      await transfer('push', details)
    }
  }

  function run(): Promise<SyncStatus> {
    running ??= (async () => {
      lastAttemptAt = now()
      status.running = true
      options.announceStatus(currentStatus())
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
          options.announceChanges(result.changedKeys)
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
      options.announceStatus(finished)
      return finished
    })()
    return running
  }

  function isOn(): boolean {
    const mode = currentStatus().mode
    return mode === 'folder' || mode === 'webdav'
  }

  function isDue(): boolean {
    if (!isOn()) {
      return false
    }
    const minutes = Number(settings.get(SyncSettingKey.interval))
    return lastAttemptAt === undefined || now() - lastAttemptAt >= minutes * 60_000
  }

  return {
    status: currentStatus,
    run,
    start() {
      if (isDue()) {
        void run()
      }
      setInterval(() => {
        if (isDue()) {
          void run()
        }
      }, CHECK_MS)
      // Leaving the app sends the changes made in it; Android may stop the app any time after.
      document.addEventListener('visibilitychange', () => {
        // A picker the app opened itself also hides the page; that is no leaving.
        if (document.visibilityState === 'hidden' && isOn() && !options.pickerOpen()) {
          void run()
        }
      })
    }
  }
}
