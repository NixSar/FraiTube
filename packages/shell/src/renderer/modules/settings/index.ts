import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const settingsModule = defineModule({
  id: 'settings',
  routes: [
    {
      path: '/settings',
      name: 'settings',
      title: 'Settings',
      component: () => import('./SettingsPage.vue')
    }
  ],
  nav: [{ route: 'settings', label: 'Settings', order: NAV_ORDER.settings, bottom: true }]
})
