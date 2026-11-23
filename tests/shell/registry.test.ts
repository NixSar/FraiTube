import { describe, expect, it } from 'vitest'
import { defineModule } from '../../packages/app-api/src/index'
import { buildRegistry } from '../../packages/shell/src/renderer/registry'

const page = () => Promise.resolve({})

describe('buildRegistry', () => {
  it('collects routes and sorts navigation by order', () => {
    const registry = buildRegistry([
      defineModule({
        id: 'a',
        routes: [{ path: '/a', name: 'a', title: 'A', component: page }],
        nav: [{ route: 'a', label: 'A', order: 20 }]
      }),
      defineModule({
        id: 'b',
        routes: [{ path: '/b', name: 'b', title: 'B', component: page }],
        nav: [{ route: 'b', label: 'B', order: 10 }]
      })
    ])

    expect(registry.routes.map((route) => route.name)).toEqual(['a', 'b'])
    expect(registry.nav.map((item) => item.route)).toEqual(['b', 'a'])
  })

  it('accepts modules without routes or navigation', () => {
    expect(buildRegistry([defineModule({ id: 'empty' })])).toEqual({ routes: [], nav: [], settings: [], settingsPanels: new Map(), frames: [], navPanels: [] })
  })

  it('collects the parts of the frame in module order', () => {
    const player = () => Promise.resolve({})
    const other = () => Promise.resolve({})
    const registry = buildRegistry([defineModule({ id: 'a', frame: player }), defineModule({ id: 'b' }), defineModule({ id: 'c', frame: other })])
    expect(registry.frames).toEqual([player, other])
  })

  it('collects the side column parts in module order', () => {
    const first = () => Promise.resolve({})
    const second = () => Promise.resolve({})
    const registry = buildRegistry([defineModule({ id: 'a', navPanel: first }), defineModule({ id: 'b' }), defineModule({ id: 'c', navPanel: second })])
    expect(registry.navPanels).toEqual([first, second])
  })

  it('keeps settings panels by section title, and refuses a panel without a section', () => {
    const section = { title: 'Sync', settings: [{ key: 'sync.flag', label: 'Flag', type: 'boolean' as const, default: false }] }
    const registry = buildRegistry([defineModule({ id: 'sync', settings: section, settingsPanel: page })])
    expect(registry.settingsPanels.get('Sync')).toBe(page)
    expect(() => buildRegistry([defineModule({ id: 'lonely', settingsPanel: page })])).toThrow('needs a settings section')
  })

  it('collects settings sections and rejects duplicate setting keys', () => {
    const section = { title: 'A', settings: [{ key: 'a.flag', label: 'Flag', type: 'boolean' as const, default: false }] }
    expect(buildRegistry([defineModule({ id: 'a', settings: section })]).settings).toEqual([section])
    expect(() => buildRegistry([defineModule({ id: 'a', settings: section }), defineModule({ id: 'b', settings: section })]))
      .toThrow('Duplicate setting key "a.flag"')
  })

  it('rejects duplicate module ids', () => {
    expect(() => buildRegistry([defineModule({ id: 'x' }), defineModule({ id: 'x' })]))
      .toThrow('Duplicate module id "x"')
  })

  it('rejects duplicate route names', () => {
    expect(() => buildRegistry([
      defineModule({ id: 'a', routes: [{ path: '/a', name: 'same', title: 'A', component: page }] }),
      defineModule({ id: 'b', routes: [{ path: '/b', name: 'same', title: 'B', component: page }] })
    ])).toThrow('duplicate route name "same"')
  })

  it('rejects duplicate route paths', () => {
    expect(() => buildRegistry([
      defineModule({ id: 'a', routes: [{ path: '/same', name: 'a', title: 'A', component: page }] }),
      defineModule({ id: 'b', routes: [{ path: '/same', name: 'b', title: 'B', component: page }] })
    ])).toThrow('duplicate route path "/same"')
  })

  it('rejects paths that do not start with a slash', () => {
    expect(() => buildRegistry([
      defineModule({ id: 'a', routes: [{ path: 'a', name: 'a', title: 'A', component: page }] })
    ])).toThrow('must start with "/"')
  })

  it('rejects navigation entries for unknown routes', () => {
    expect(() => buildRegistry([
      defineModule({ id: 'a', nav: [{ route: 'missing', label: 'Missing' }] })
    ])).toThrow('unknown route "missing"')
  })
})
