import type { SettingDefinition, SettingsSection } from '@fraitube/app-api'

/** The order of the Settings page sections; any other section follows them in module order. */
export const SECTION_ORDER = ['Playback', 'Subtitles', 'SponsorBlock', 'Appearance', 'General', 'Sync', 'Backup']

/** A section as the Settings page shows it. */
export interface ShownSection {
  title: string
  /** An ID for jumping to the section. */
  id: string
  settings: SettingDefinition[]
  /** True when a module's panel shows in this section, under its settings. */
  hasPanel: boolean
}

export function sectionId(title: string): string {
  return `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/**
 * The sections of the Settings page: each visible setting under its group, or its module's title,
 * and each panel under its module's title. Sections follow SECTION_ORDER; empty ones are left out.
 */
export function settingsLayout(sections: readonly SettingsSection[], panelTitles: ReadonlySet<string>): ShownSection[] {
  const shown = new Map<string, ShownSection>()
  const sectionFor = (title: string): ShownSection => {
    let section = shown.get(title)
    if (!section) {
      section = { title, id: sectionId(title), settings: [], hasPanel: false }
      shown.set(title, section)
    }
    return section
  }
  for (const section of sections) {
    for (const setting of section.settings) {
      if (!setting.hidden) {
        sectionFor(setting.group ?? section.title).settings.push(setting)
      }
    }
    if (panelTitles.has(section.title)) {
      sectionFor(section.title).hasPanel = true
    }
  }
  const rank = (title: string): number => {
    const index = SECTION_ORDER.indexOf(title)
    return index === -1 ? SECTION_ORDER.length : index
  }
  return [...shown.values()]
    .filter((section) => section.settings.length > 0 || section.hasPanel)
    .sort((a, b) => rank(a.title) - rank(b.title))
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

/**
 * The sections and settings that match a search. A section whose title matches shows whole; otherwise
 * only settings whose label or choices match show, and a section with no match is left out.
 * A section's panel shows whenever its section shows.
 */
export function searchSettings(sections: readonly ShownSection[], search: string): ShownSection[] {
  const query = search.trim().toLowerCase()
  if (!query) {
    return [...sections]
  }
  return sections.flatMap((section) => {
    if (matches(section.title, query)) {
      return [section]
    }
    const settings = section.settings.filter((setting) =>
      matches(setting.label, query) ||
      (setting.type === 'choice' && setting.options.some((option) => matches(option.label, query))))
    return settings.length > 0 ? [{ ...section, settings }] : []
  })
}
