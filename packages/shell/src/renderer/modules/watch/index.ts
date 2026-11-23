import { defineModule } from '@fraitube/app-api'
import { playerSettings } from '../../../shared/playerSettings'

export const watchModule = defineModule({
  id: 'watch',
  routes: [
    {
      path: '/watch/:videoId',
      name: 'watch',
      title: 'Watch',
      component: () => import('./WatchPage.vue')
    },
    {
      path: '/pip/:videoId',
      name: 'pip',
      title: 'Picture in picture',
      component: () => import('./PipPage.vue'),
      bare: true
    }
  ],
  settings: playerSettings,
  frame: () => import('./PlayerFrame.vue')
})
