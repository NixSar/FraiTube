import type { SettingsSection } from '@fraitube/app-api/settings'

export const SyncSettingKey = {
  mode: 'sync.mode',
  folder: 'sync.folder',
  rcloneRemote: 'sync.rcloneRemote',
  rcloneProgram: 'sync.rcloneProgram',
  interval: 'sync.interval'
} as const

export type SyncMode = 'off' | 'folder' | 'rclone'

/** Minutes between syncs the interval setting offers. */
export const SYNC_INTERVALS = [5, 15, 30, 60]

/** Longest sync folder or rclone executable path accepted. */
export const MAX_SYNC_PATH_LENGTH = 1000

/**
 * Sync settings. All of them belong to this computer, so they are local and never synced. The folder,
 * the rclone executable and the remote are chosen in the sync panel, so they are hidden from the form.
 */
export const syncSettings: SettingsSection = {
  title: 'Sync',
  settings: [
    {
      key: SyncSettingKey.mode,
      label: 'Sync mode',
      type: 'choice',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'folder', label: 'Folder' },
        { value: 'rclone', label: 'rclone' }
      ],
      default: 'off',
      local: true
    },
    {
      key: SyncSettingKey.interval,
      label: 'Sync every',
      type: 'choice',
      options: SYNC_INTERVALS.map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` })),
      default: '15',
      local: true
    },
    { key: SyncSettingKey.folder, label: 'Sync folder', type: 'text', maxLength: MAX_SYNC_PATH_LENGTH, default: '', local: true, hidden: true },
    {
      key: SyncSettingKey.rcloneProgram,
      label: 'Path to the rclone executable',
      type: 'text',
      maxLength: MAX_SYNC_PATH_LENGTH,
      default: '',
      local: true,
      hidden: true
    },
    { key: SyncSettingKey.rcloneRemote, label: 'rclone remote', type: 'text', maxLength: 200, default: '', local: true, hidden: true }
  ]
}

/** What the Settings page shows about sync. */
export interface SyncStatus {
  mode: SyncMode
  running: boolean
  /** When the last sync finished, successful or not. */
  lastSyncAt?: number
  lastError?: string
  sent: number
  received: number
  computers: number
  unreadable: number
}

/** The remotes rclone reports, or why they could not be listed. */
export interface RcloneRemotes {
  remotes: string[]
  error?: string
}

export function isSyncMode(value: unknown): value is SyncMode {
  return value === 'off' || value === 'folder' || value === 'rclone'
}
