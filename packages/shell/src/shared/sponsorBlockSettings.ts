import type { SettingDefinition, SettingsSection } from '@fraitube/app-api/settings'
import { DEFAULT_SERVER, isCategoryMode, SKIPPABLE_CATEGORIES, type CategoryModes } from '@fraitube/sponsorblock'
import type { SettingValue } from '@fraitube/app-api/settings'
import type { SkippableCategory } from '@fraitube/sponsorblock/types'

export const SponsorBlockSettingKey = {
  enabled: 'sponsorBlock.enabled',
  server: 'sponsorBlock.server'
} as const

/** The setting key of a category's choice, for example sponsorBlock.category.musicOfftopic. */
export function categorySettingKey(category: SkippableCategory): string {
  const name = category.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
  return `sponsorBlock.category.${name}`
}

const MODE_OPTIONS = [
  { value: 'skip', label: 'Skip' },
  { value: 'show', label: 'Show on seek bar' },
  { value: 'off', label: 'Off' }
]

/** Settings owned by the SponsorBlock module. It is off until turned on here. */
export const sponsorBlockSettings: SettingsSection = {
  title: 'SponsorBlock',
  settings: [
    { key: SponsorBlockSettingKey.enabled, label: 'Use SponsorBlock', type: 'boolean', default: false },
    { key: SponsorBlockSettingKey.server, label: 'Server address', type: 'text', maxLength: 200, default: DEFAULT_SERVER },
    ...SKIPPABLE_CATEGORIES.map((category): SettingDefinition => ({
      key: categorySettingKey(category.id),
      label: category.label,
      type: 'choice',
      options: MODE_OPTIONS,
      default: category.defaultMode
    }))
  ]
}

/** Every category's choice, read from setting values. */
export function categoryModes(read: (key: string) => SettingValue | undefined): CategoryModes {
  const modes: Partial<Record<SkippableCategory, 'skip' | 'show' | 'off'>> = {}
  for (const category of SKIPPABLE_CATEGORIES) {
    const value = read(categorySettingKey(category.id))
    modes[category.id] = isCategoryMode(value) ? value : category.defaultMode
  }
  return modes
}
