import type { NavItem } from '@fraitube/app-api'

/** Where each tab sits in the side column: lower numbers first, the top ones above the modules' parts. */
export const NAV_ORDER = {
  subscriptions: 10,
  favorites: 20,
  history: 30,
  channels: 900,
  settings: 1000,
  about: 1100
} as const

/** The links at the top of the side column, above the modules' parts, and those at its bottom, each in order. */
export function splitNav(nav: readonly NavItem[]): { name: 'top' | 'bottom'; items: NavItem[] }[] {
  return [
    { name: 'top', items: nav.filter((item) => item.bottom !== true) },
    { name: 'bottom', items: nav.filter((item) => item.bottom === true) }
  ]
}
