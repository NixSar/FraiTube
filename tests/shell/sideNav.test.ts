import { describe, expect, it } from 'vitest'
import { NAV_ORDER, splitNav } from '../../packages/shell/src/renderer/sideNav'
import { ABOUT, CREDITS } from '../../packages/shell/src/renderer/modules/about/about'

describe('side navigation', () => {
  it('has New videos, Favorites and History at the top, and Subscriptions, Settings and About at the bottom', () => {
    const bottom = new Set(['channels', 'settings', 'about'])
    const nav = Object.entries(NAV_ORDER)
      .map(([route, order]) => ({ route, label: route, order, bottom: bottom.has(route) }))
      .sort((a, b) => a.order - b.order)
    expect(splitNav(nav).map((group) => [group.name, group.items.map((item) => item.route)])).toEqual([
      ['top', ['subscriptions', 'favorites', 'history']],
      ['bottom', ['channels', 'settings', 'about']]
    ])
  })
})

describe('About page', () => {
  it('names the license and links to the repository over https', () => {
    expect(ABOUT.license).toBe('AGPL-3.0-or-later')
    for (const url of [ABOUT.licenseUrl, ABOUT.repositoryUrl, ABOUT.issuesUrl, ...CREDITS.map((credit) => credit.url)]) {
      expect(url.startsWith('https://')).toBe(true)
    }
  })
})
