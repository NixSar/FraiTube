import { defineModule } from '@fraitube/app-api'
import { NAV_ORDER } from '../../sideNav'

export const subscriptionsModule = defineModule({
  id: 'subscriptions',
  routes: [
    {
      path: '/subscriptions',
      name: 'subscriptions',
      title: 'Subscriptions',
      component: () => import('./SubscriptionsPage.vue')
    },
    {
      path: '/channels',
      name: 'channels',
      title: 'Channels',
      component: () => import('./ChannelsPage.vue')
    }
  ],
  nav: [
    { route: 'subscriptions', label: 'Subscriptions', order: NAV_ORDER.subscriptions },
    { route: 'channels', label: 'Channels', order: NAV_ORDER.channels, bottom: true }
  ]
})
