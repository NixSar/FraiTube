import type { SettingsSection } from '@fraitube/app-api/settings'

export const SyncSettingKey = {
  mode: 'sync.mode',
  folder: 'sync.folder',
  rcloneRemote: 'sync.rcloneRemote',
  rcloneProgram: 'sync.rcloneProgram',
  webdavAddress: 'sync.webdavAddress',
  webdavUser: 'sync.webdavUser',
  interval: 'sync.interval',
  place: 'sync.place'
} as const

/** Told as the last place while the sync folder was picked anew and its address is not known as a text. */
export const CHANGED_SYNC_PLACE = 'changed'

/**
 * The place a sync mode syncs through, as one text: the folder, the rclone remote or the WebDAV
 * address. A place that differs from the one synced with last holds nothing of this computer yet.
 */
export function syncPlace(mode: SyncMode, read: (key: string) => string): string {
  switch (mode) {
    case 'folder': return `folder ${read(SyncSettingKey.folder)}`
    case 'rclone': return `rclone ${read(SyncSettingKey.rcloneRemote)}`
    case 'webdav': return `webdav ${read(SyncSettingKey.webdavAddress)}`
    default: return ''
  }
}

/** rclone exists only in the desktop app. */
export type SyncMode = 'off' | 'folder' | 'rclone' | 'webdav'

/** Longest WebDAV address or user name accepted. */
export const MAX_WEBDAV_TEXT_LENGTH = 500

/** Minutes between syncs the interval setting offers. */
export const SYNC_INTERVALS = [5, 15, 30, 60]

/** Longest sync folder or rclone executable path accepted. */
export const MAX_SYNC_PATH_LENGTH = 1000

/**
 * Sync settings. All of them belong to this computer, so they are local and never synced. The folder,
 * the rclone executable and remote and the WebDAV details are set in the sync panel, so they are
 * hidden from the form.
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
        { value: 'rclone', label: 'rclone', only: 'desktop' },
        { value: 'webdav', label: 'WebDAV' }
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
    { key: SyncSettingKey.rcloneRemote, label: 'rclone remote', type: 'text', maxLength: 200, default: '', local: true, hidden: true },
    { key: SyncSettingKey.webdavAddress, label: 'WebDAV address', type: 'text', maxLength: MAX_WEBDAV_TEXT_LENGTH, default: '', local: true, hidden: true },
    { key: SyncSettingKey.webdavUser, label: 'WebDAV user name', type: 'text', maxLength: MAX_WEBDAV_TEXT_LENGTH, default: '', local: true, hidden: true },
    // The place synced with last, kept by the app to notice a change of place.
    { key: SyncSettingKey.place, label: 'Last sync place', type: 'text', maxLength: MAX_SYNC_PATH_LENGTH + 20, default: '', local: true, hidden: true }
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
  return value === 'off' || value === 'folder' || value === 'rclone' || value === 'webdav'
}
