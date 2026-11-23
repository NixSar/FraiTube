import { defineModule } from '@fraitube/app-api'
import { backupSettings } from '../../../shared/backupSettings'

/** Backup owns the Backup section of Settings, with its buttons and the last result. */
export const backupModule = defineModule({
  id: 'backup',
  settings: backupSettings,
  settingsPanel: () => import('./BackupPanel.vue')
})
