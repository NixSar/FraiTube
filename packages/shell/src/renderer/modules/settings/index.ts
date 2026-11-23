import { defineModule } from '@fraitube/app-api'

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
  nav: [{ route: 'settings', label: 'Settings', order: 1000 }]
})
