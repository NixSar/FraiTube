import type { SettingDefinition, SettingsSection } from '@fraitube/app-api/settings'
import { backupSettings } from './backupSettings'
import { historySettings } from './history'
import { playerSettings } from './playerSettings'
import { searchHistorySettings } from './searchHistory'
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

/** How often New videos fetches from YouTube again: every so many hours, or only when asked. */
export const FEED_REFRESH_CHOICES = [
  { value: '1', label: 'Every hour' },
  ...[2, 3, 6, 12, 24].map((hours) => ({ value: String(hours), label: `Every ${hours} hours` })),
  { value: 'off', label: 'Off' }
]

export const SettingKey = {
  theme: 'appearance.theme',
  accent: 'appearance.accent',
  startPage: 'appearance.startPage',
  feedRefresh: 'subscriptions.refresh',
  checkUpdates: 'updates.checkOnStart',
  showShorts: 'shorts.show',
  dismissedUpdate: 'updates.dismissed',
  windowBounds: 'window.bounds'
} as const

/** Whether shorts show, for a saved Show Shorts value: only when it is turned on. */
export function shortsShown(value: unknown): boolean {
  return value === true
}

/** The items to show: every one while shorts show, otherwise those not marked as shorts. */
export function withoutHiddenShorts<Item extends { short?: boolean }>(items: readonly Item[], showShorts: boolean): Item[] {
  return showShorts ? [...items] : items.filter((item) => item.short !== true)
}

/** The route the app opens at for a saved start page value, New videos when the value is not one of the tabs. */
export function startPageRoute(value: unknown): string {
  return START_PAGES.find((page) => page.value === value)?.value ?? 'subscriptions'
}

/**
 * How old a fetched feed may be before opening New videos fetches it again, for a saved refresh value:
 * undefined for Off, where it fetches only on Refresh or for a new subscription, and an hour for a value
 * that is not one of the choices.
 */
export function feedMaxAgeMs(value: unknown): number | undefined {
  if (value === 'off') {
    return undefined
  }
  const choice = FEED_REFRESH_CHOICES.find((option) => option.value === value)
  return Number(choice?.value ?? 1) * 60 * 60_000
}

/** Settings owned by the shell itself. */
export const shellSettings: SettingsSection = {
  title: 'Appearance',
  settings: [
    { key: SettingKey.theme, label: 'Theme', type: 'choice', options: THEMES, default: 'system' },
    { key: SettingKey.accent, label: 'Accent color', type: 'color', default: '#3d7bd9' },
    { key: SettingKey.startPage, label: 'Open the app at', group: 'General', type: 'choice', options: START_PAGES, default: 'subscriptions' },
    { key: SettingKey.feedRefresh, label: 'Refresh New videos', group: 'General', type: 'choice', options: FEED_REFRESH_CHOICES, default: '1' },
    { key: SettingKey.checkUpdates, label: 'Check for updates when FraiTube starts', group: 'General', type: 'boolean', default: true },
    { key: SettingKey.showShorts, label: 'Show Shorts', group: 'General', type: 'boolean', default: false },
    // The version whose update banner was dismissed; the banner shows again for a newer one.
    { key: SettingKey.dismissedUpdate, label: 'Dismissed update', group: 'General', type: 'text', maxLength: 40, default: '', local: true, hidden: true },
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
export const installedSettings: SettingsSection[] = [shellSettings, playerSettings, historySettings, searchHistorySettings, sponsorBlockSettings, syncSettings, backupSettings]

export function allSettingDefinitions(): SettingDefinition[] {
  return installedSettings.flatMap((section) => section.settings)
}
