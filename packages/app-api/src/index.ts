import type { Component } from 'vue'
import type { SettingsSection } from './settings'

export * from './settings'

/** A page a module adds to the app. */
export interface ModuleRoute {
  /** URL path, starting with "/", for example "/subscriptions". */
  path: string
  /** Unique route name across all modules. */
  name: string
  /** Window and tab title. */
  title: string
  /** Loads the page component on first visit. */
  component: () => Promise<Component | { default: Component }>
  /** Shows the page alone, without the app's top bar, tabs and frame parts. */
  bare?: boolean
}

/** An entry a module adds to the side navigation. */
export interface NavItem {
  /** Name of the route the entry opens. */
  route: string
  label: string
  /** Lower numbers come first. */
  order?: number
  /** Shown at the bottom of the side column, below the modules' parts, instead of at its top. */
  bottom?: boolean
}

/** Everything a feature module plugs into the app. */
export interface FraiTubeModule {
  /** Unique module id, for example "subscriptions". */
  id: string
  routes?: ModuleRoute[]
  nav?: NavItem[]
  /** Settings the module owns, shown on the Settings page unless hidden. */
  settings?: SettingsSection
  /** A part of the Settings page shown under the module's settings, for example a status with buttons. */
  settingsPanel?: () => Promise<Component | { default: Component }>
  /** A part of the app frame that stays alive on every page, for example the player. */
  frame?: () => Promise<Component | { default: Component }>
  /** A part shown in the side column under the navigation links, for example videos to continue watching. */
  navPanel?: () => Promise<Component | { default: Component }>
}

/** Declares a module with full type checking. */
export function defineModule(module: FraiTubeModule): FraiTubeModule {
  return module
}
