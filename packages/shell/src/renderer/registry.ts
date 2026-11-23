import type { InjectionKey } from 'vue'
import { checkSettingDefinitions, type FraiTubeModule, type ModuleRoute, type NavItem, type SettingsSection } from '@fraitube/app-api'

/** All routes, navigation entries and settings of the installed modules. */
export interface Registry {
  routes: ModuleRoute[]
  nav: NavItem[]
  /** Settings sections in module order. */
  settings: SettingsSection[]
  /** Settings page panels, by the title of the section they belong to. */
  settingsPanels: Map<string, NonNullable<FraiTubeModule['settingsPanel']>>
  /** Parts of the app frame, in module order. */
  frames: NonNullable<FraiTubeModule['frame']>[]
  /** Parts of the side column under the navigation links, in module order. */
  navPanels: NonNullable<FraiTubeModule['navPanel']>[]
}

/**
 * Collects the routes, navigation entries and settings of all modules.
 * Throws on duplicate module ids, duplicate route names or paths,
 * invalid paths, navigation entries for unknown routes, and bad or duplicate setting keys.
 */
export function buildRegistry(modules: readonly FraiTubeModule[]): Registry {
  const moduleIds = new Set<string>()
  const routeNames = new Set<string>()
  const routePaths = new Set<string>()
  const routes: ModuleRoute[] = []
  const nav: NavItem[] = []
  const settings: SettingsSection[] = []

  for (const module of modules) {
    if (moduleIds.has(module.id)) {
      throw new Error(`Duplicate module id "${module.id}"`)
    }
    moduleIds.add(module.id)

    for (const route of module.routes ?? []) {
      if (!route.path.startsWith('/')) {
        throw new Error(`Module "${module.id}": route path "${route.path}" must start with "/"`)
      }
      if (routeNames.has(route.name)) {
        throw new Error(`Module "${module.id}": duplicate route name "${route.name}"`)
      }
      if (routePaths.has(route.path)) {
        throw new Error(`Module "${module.id}": duplicate route path "${route.path}"`)
      }
      routeNames.add(route.name)
      routePaths.add(route.path)
      routes.push(route)
    }
  }

  for (const module of modules) {
    for (const item of module.nav ?? []) {
      if (!routeNames.has(item.route)) {
        throw new Error(`Module "${module.id}": navigation entry for unknown route "${item.route}"`)
      }
      nav.push(item)
    }
  }

  nav.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const settingsPanels: Registry['settingsPanels'] = new Map()
  for (const module of modules) {
    if (module.settings) {
      settings.push(module.settings)
      if (module.settingsPanel) {
        settingsPanels.set(module.settings.title, module.settingsPanel)
      }
    } else if (module.settingsPanel) {
      throw new Error(`Module "${module.id}": a settings panel needs a settings section`)
    }
  }
  checkSettingDefinitions(settings.flatMap((section) => section.settings))

  const frames = modules.flatMap((module) => (module.frame ? [module.frame] : []))
  const navPanels = modules.flatMap((module) => (module.navPanel ? [module.navPanel] : []))

  return { routes, nav, settings, settingsPanels, frames, navPanels }
}

/** Lets pages read the registry, for example the Settings page. */
export const registryKey: InjectionKey<Registry> = Symbol('registry')
