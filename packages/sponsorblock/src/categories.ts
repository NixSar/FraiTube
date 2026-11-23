import type { Category, CategoryMode, SkippableCategory } from './types'

export interface CategoryInfo {
  id: SkippableCategory
  label: string
  /** The word used in "Skipped ...". */
  noun: string
  color: string
  defaultMode: CategoryMode
}

/** The categories with a skip choice, in the order the settings show them, with SponsorBlock's colors. */
export const SKIPPABLE_CATEGORIES: readonly CategoryInfo[] = [
  { id: 'sponsor', label: 'Sponsor', noun: 'sponsor', color: '#00d400', defaultMode: 'skip' },
  { id: 'selfpromo', label: 'Self-promotion', noun: 'self-promotion', color: '#ffff00', defaultMode: 'off' },
  { id: 'interaction', label: 'Interaction reminder', noun: 'interaction reminder', color: '#cc00ff', defaultMode: 'off' },
  { id: 'intro', label: 'Intro', noun: 'intro', color: '#00ffff', defaultMode: 'off' },
  { id: 'outro', label: 'Outro', noun: 'outro', color: '#0202ed', defaultMode: 'off' },
  { id: 'preview', label: 'Preview', noun: 'preview', color: '#008fd6', defaultMode: 'off' },
  { id: 'music_offtopic', label: 'Non-music section', noun: 'non-music section', color: '#ff9900', defaultMode: 'off' },
  { id: 'filler', label: 'Filler', noun: 'filler', color: '#7300ff', defaultMode: 'off' }
]

export const HIGHLIGHT_COLOR = '#ff1684'

const byId = new Map<string, CategoryInfo>(SKIPPABLE_CATEGORIES.map((category) => [category.id, category]))

export function isSkippableCategory(value: unknown): value is SkippableCategory {
  return typeof value === 'string' && byId.has(value)
}

export function isCategory(value: unknown): value is Category {
  return value === 'poi_highlight' || isSkippableCategory(value)
}

export function categoryColor(category: Category): string {
  return category === 'poi_highlight' ? HIGHLIGHT_COLOR : byId.get(category)?.color ?? HIGHLIGHT_COLOR
}

export function categoryNoun(category: Category): string {
  return category === 'poi_highlight' ? 'highlight' : byId.get(category)?.noun ?? category
}

export function isCategoryMode(value: unknown): value is CategoryMode {
  return value === 'skip' || value === 'show' || value === 'off'
}
