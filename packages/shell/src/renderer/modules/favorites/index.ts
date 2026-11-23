import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const favoritesModule = defineModule({
  id: 'favorites',
  routes: [
    {
      path: '/favorites',
      name: 'favorites',
      title: 'Favorites',
      component: () => import('./FavoritesPage.vue')
    }
  ],
  nav: [{ route: 'favorites', label: 'Favorites', order: NAV_ORDER.favorites, icon: 'favorites' }]
})
