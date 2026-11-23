import { defineModule } from '@fraitube/app-api'

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
    { route: 'subscriptions', label: 'Subscriptions', order: 10 },
    { route: 'channels', label: 'Channels', order: 20 }
  ]
})
