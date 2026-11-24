import { defineModule, type FraiTubeModule } from '@fraitube/app-api'
import { shellSettings } from '../shared/settings'
import { aboutModule } from './modules/about'
import { backupModule } from './modules/backup'
import { favoritesModule } from './modules/favorites'
import { historyModule } from './modules/history'
import { searchModule } from './modules/search'
import { searchHistoryModule } from './modules/searchHistory'
import { settingsModule } from './modules/settings'
import { sponsorBlockModule } from './modules/sponsorblock'
import { syncModule } from './modules/sync'
import { subscriptionsModule } from './modules/subscriptions'
import { watchModule } from './modules/watch'

/** Settings that belong to the shell itself. */
const shellModule = defineModule({
  id: 'shell',
  settings: shellSettings
})

/** All modules the app loads, in registration order. Their settings must also be listed in shared/settings.ts. */
export const installedModules: FraiTubeModule[] = [shellModule, searchModule, subscriptionsModule, favoritesModule, historyModule, watchModule, sponsorBlockModule, searchHistoryModule, syncModule, backupModule, settingsModule, aboutModule]
