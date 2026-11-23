import type { SettingsSection } from '@fraitube/app-api/settings'

/** The Backup section has no settings of its own; its panel holds the buttons and the status. */
export const backupSettings: SettingsSection = {
  title: 'Backup',
  settings: []
}

/** What the Settings page shows about backups. */
export interface BackupStatus {
  working: boolean
  lastAction?: 'backup' | 'restore'
  /** When the last backup or restore finished. */
  at?: number
  /** The file of the last backup. */
  file?: string
  error?: string
}
