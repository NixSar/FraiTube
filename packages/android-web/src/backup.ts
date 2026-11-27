import sevenZipWasm from '7z-wasm/7zz.wasm?url'
import { backupFileName, backupManifest, checkManifest, packBackup, readBackup } from '@fraitube/backup/manifest'
import type { LoadSevenZip } from '@fraitube/backup/types'
import type { ModuleSchema, Storage } from '@fraitube/storage'
import type { BackupStatus } from '../../shell/src/shared/backupSettings'
import { awaitNative } from './hiddenCalls'
import { toBase64, type AppNative } from './native'

/** Tables that belong to this phone and stay as they are when a backup is restored. */
const KEPT_TABLES = ['local_settings']
/** Tables emptied when a backup is restored, so the next sync starts fresh. */
const CLEARED_TABLES = ['sync_versions', 'sync_read_files']
/** The size of one piece of a file sent to the Android side. */
const UPLOAD_PIECE_BYTES = 256 * 1024

/** Loads the 7-Zip program packed with the app's pages. */
const loadSevenZip: LoadSevenZip = async () => (await fetch(sevenZipWasm)).arrayBuffer()

export interface BackupServiceOptions {
  native: AppNative
  storage: Storage
  schemas: readonly ModuleSchema[]
  /** Asks for a file with Android's file picker; undefined when none was chosen. */
  chooseFile(kind: 'backup'): Promise<{ name: string; contents: Response } | undefined>
  /** Tells the pages that the backup status changed. */
  announce(status: BackupStatus): void
}

export interface BackupService {
  status(): BackupStatus
  /** Asks where to save, then writes a backup there. */
  create(): Promise<BackupStatus>
  /** Asks for a backup, confirms, restores it and loads the app anew. */
  restore(): Promise<BackupStatus>
}

/** Backup and restore as on the desktop: the database and a manifest in one 7z file. */
export function createBackupService(options: BackupServiceOptions): BackupService {
  const { native, storage } = options
  const status: BackupStatus = { working: false }

  function update(change: Partial<BackupStatus>): void {
    Object.assign(status, change)
    options.announce({ ...status })
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

  /** Sends a file to the Android side in pieces and returns the ID it is known by there. */
  function upload(bytes: Uint8Array): string {
    const id = native.uploadStart()
    for (let start = 0; start < bytes.length; start += UPLOAD_PIECE_BYTES) {
      native.uploadChunk(id, toBase64(bytes.subarray(start, start + UPLOAD_PIECE_BYTES)))
    }
    return id
  }

  function moduleVersions(): Record<string, number> {
    const rows = storage.db.prepare('SELECT module, version FROM _schema ORDER BY module').all() as unknown as { module: string; version: number }[]
    return Object.fromEntries(rows.map((row) => [row.module, row.version]))
  }

  return {
    status: () => ({ ...status }),
    create: () => guarded('backup', async () => {
      const copy = JSON.parse(native.backupCopy()) as { id?: string; error?: string }
      if (copy.id === undefined) {
        throw new Error(copy.error ?? 'The database could not be copied')
      }
      const database = new Uint8Array(await (await fetch(`/_file/${copy.id}`)).arrayBuffer())
      const manifest = backupManifest(native.version(), moduleVersions(), Date.now())
      const archive = await packBackup(manifest, database, loadSevenZip)
      const uploadId = upload(archive)
      const saved = await awaitNative((callId) => native.saveFile(callId, uploadId, backupFileName(new Date()), 'application/x-7z-compressed'))
      return saved || undefined
    }),
    restore: () => guarded('restore', async () => {
      const file = await options.chooseFile('backup')
      if (!file) {
        return undefined
      }
      const { manifest, database } = await readBackup(new Uint8Array(await file.contents.arrayBuffer()), loadSevenZip)
      checkManifest(manifest, options.schemas)

      const confirmed = await awaitNative((callId) => native.confirm(
        callId,
        'Restore backup',
        `Restore the backup from ${new Date(manifest.createdAt).toLocaleString()}?\n\n` +
          'Subscriptions, history and synced settings are replaced by the backup\'s. This phone keeps its own local settings. FraiTube starts anew.',
        'Restore'
      ))
      if (!confirmed) {
        return undefined
      }

      const failure = native.restoreDatabase(upload(database), JSON.stringify(KEPT_TABLES), JSON.stringify(CLEARED_TABLES))
      if (failure) {
        throw new Error(failure)
      }
      // The pages load anew over the restored database.
      native.reload()
      return file.name
    })
  }
}
