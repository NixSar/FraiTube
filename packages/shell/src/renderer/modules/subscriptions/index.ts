import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const subscriptionsModule = defineModule({
  id: 'subscriptions',
  routes: [
    {
      path: '/subscriptions',
      name: 'subscriptions',
      title: 'New videos',
      component: () => import('./SubscriptionsPage.vue')
    },
    {
      path: '/channels',
      name: 'channels',
      title: 'Subscriptions',
      component: () => import('./ChannelsPage.vue')
    }
  ],
  nav: [
    { route: 'subscriptions', label: 'New videos', order: NAV_ORDER.subscriptions, icon: 'subscriptions' },
    { route: 'channels', label: 'Subscriptions', order: NAV_ORDER.channels, bottom: true, icon: 'channels' }
  ]
})
