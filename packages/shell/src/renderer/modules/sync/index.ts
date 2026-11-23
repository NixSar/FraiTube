import { defineModule } from '@fraitube/app-api'
import { syncSettings } from '../../../shared/syncSettings'

/** Sync owns its settings and the sync status shown under them. */
export const syncModule = defineModule({
  id: 'sync',
  settings: syncSettings,
  settingsPanel: () => import('./SyncPanel.vue')
})
