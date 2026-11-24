import { defineModule } from '@fraitube/app-api'
import { searchHistorySettings } from '../../../shared/searchHistory'

/** Search history owns the Search history section of Settings, with its clear button. */
export const searchHistoryModule = defineModule({
  id: 'searchHistory',
  settings: searchHistorySettings,
  settingsPanel: () => import('./SearchHistoryPanel.vue')
})
