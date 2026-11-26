import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const historyModule = defineModule({
  id: 'history',
  routes: [
    {
      path: '/history',
      name: 'history',
      title: 'History',
      component: () => import('./HistoryPage.vue')
    }
  ],
  nav: [{ route: 'history', label: 'History', order: NAV_ORDER.history, icon: 'history' }],
  navPanel: () => import('./ContinueWatching.vue')
})
