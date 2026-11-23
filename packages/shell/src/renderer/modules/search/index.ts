import { defineModule } from '@fraitube/app-api'

export const searchModule = defineModule({
  id: 'search',
  routes: [
    {
      path: '/search',
      name: 'search',
      title: 'Search',
      component: () => import('./SearchPage.vue')
    }
  ]
})
