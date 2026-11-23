import type { FraiTubeBridge } from '../shared/bridge'

declare global {
  interface Window {
    fraitube: FraiTubeBridge
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

export {}
