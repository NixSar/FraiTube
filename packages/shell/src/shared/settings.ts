import type { SettingDefinition, SettingsSection } from '@fraitube/app-api/settings'
import { backupSettings } from './backupSettings'
import { historySettings } from './history'
import { playerSettings } from './playerSettings'
import { sponsorBlockSettings } from './sponsorBlockSettings'
import { syncSettings } from './syncSettings'

export const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'solarized-light', label: 'Solarized light' },
  { value: 'solarized-dark', label: 'Solarized dark' },
  { value: 'black', label: 'Black' }
]

/** The tabs the app can open at; each value is the name of the tab's route. */
export const START_PAGES = [
  { value: 'subscriptions', label: 'New videos' },
  { value: 'channels', label: 'Subscriptions' },
  { value: 'history', label: 'History' }
]

export const SettingKey = {
  theme: 'appearance.theme',
  accent: 'appearance.accent',
  startPage: 'appearance.startPage',
  windowBounds: 'window.bounds'
} as const

/** The route the app opens at for a saved start page value, New videos when the value is not one of the tabs. */
export function startPageRoute(value: unknown): string {
  return START_PAGES.find((page) => page.value === value)?.value ?? 'subscriptions'
}

/** Settings owned by the shell itself. */
export const shellSettings: SettingsSection = {
  title: 'Appearance',
  settings: [
    { key: SettingKey.theme, label: 'Theme', type: 'choice', options: THEMES, default: 'system' },
    { key: SettingKey.accent, label: 'Accent color', type: 'color', default: '#3d7bd9' },
    { key: SettingKey.startPage, label: 'Open the app at', group: 'General', type: 'choice', options: START_PAGES, default: 'subscriptions' },
    {
      key: SettingKey.windowBounds,
      label: 'Window size and position',
      group: 'General',
      type: 'bounds',
      default: { width: 1200, height: 800, maximized: false },
      local: true,
      hidden: true
    }
  ]
}

/** The settings sections of every installed module. The main process checks and stores values against these. */
export const installedSettings: SettingsSection[] = [shellSettings, playerSettings, historySettings, sponsorBlockSettings, syncSettings, backupSettings]

export function allSettingDefinitions(): SettingDefinition[] {
  return installedSettings.flatMap((section) => section.settings)
}
