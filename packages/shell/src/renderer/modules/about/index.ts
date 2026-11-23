import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const aboutModule = defineModule({
  id: 'about',
  routes: [
    {
      path: '/about',
      name: 'about',
      title: 'About',
      component: () => import('./AboutPage.vue')
    }
  ],
  nav: [{ route: 'about', label: 'About', order: NAV_ORDER.about, bottom: true }]
})
