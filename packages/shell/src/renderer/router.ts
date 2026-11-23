import { createRouter, createWebHashHistory, type Router } from 'vue-router'
import type { Registry } from './registry'

/**
 * The app's router. The root path "/", where the app and new windows open, leads to the route
 * startRoute names at that moment.
 */
export function createAppRouter(registry: Registry, startRoute: () => string): Router {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: () => ({ name: startRoute() }) },
      ...registry.routes.map((route) => ({
        path: route.path,
        name: route.name,
        component: route.component,
        meta: { title: route.title, bare: route.bare === true }
      })),
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('./pages/NotFoundPage.vue'),
        meta: { title: 'Page not found' }
      }
    ]
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} - FraiTube` : 'FraiTube'
  })

  return router
}
