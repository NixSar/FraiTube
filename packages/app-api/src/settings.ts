/** Setting definitions. Plain data, shared by the main process and the pages. */

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export type SettingValue = string | number | boolean | WindowBounds

interface BaseSetting {
  /** Dotted key, for example "appearance.theme". */
  key: string
  label: string
  /** Local settings belong to one computer and are never synced. */
  local?: boolean
  /** Hidden settings are kept by the app and not shown on the Settings page. */
  hidden?: boolean
  /** The Settings page section it shows under, when not the one its module's settings are titled. */
  group?: string
  /** Other words the Settings page search finds it by, besides its label, choices and section. */
  keywords?: string[]
}

export interface ChoiceSetting extends BaseSetting {
  type: 'choice'
  options: { value: string; label: string }[]
  default: string
}

export interface ColorSetting extends BaseSetting {
  type: 'color'
  default: string
}

export interface BooleanSetting extends BaseSetting {
  type: 'boolean'
  default: boolean
}

export interface NumberSetting extends BaseSetting {
  type: 'number'
  default: number
  min?: number
  max?: number
}

export interface TextSetting extends BaseSetting {
  type: 'text'
  default: string
  /** Longest accepted text, MAX_TEXT_LENGTH when left out. */
  maxLength?: number
}

export interface BoundsSetting extends BaseSetting {
  type: 'bounds'
  default: WindowBounds
}

export type SettingDefinition = ChoiceSetting | ColorSetting | BooleanSetting | NumberSetting | TextSetting | BoundsSetting

/** A module's settings, shown together under one title. */
export interface SettingsSection {
  title: string
  settings: SettingDefinition[]
}

const KEY = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/
const COLOR = /^#[0-9a-f]{6}$/i
const MAX_WINDOW_SIZE = 100_000
// Control characters are never part of a setting text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

/** Longest text a text setting accepts unless it sets its own limit. */
export const MAX_TEXT_LENGTH = 200

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBounds(value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const bounds = value as Partial<WindowBounds>
  const size = (n: unknown): boolean => isFiniteNumber(n) && n > 0 && n <= MAX_WINDOW_SIZE
  const position = (n: unknown): boolean => n === undefined || (isFiniteNumber(n) && Math.abs(n) <= MAX_WINDOW_SIZE)
  return size(bounds.width) && size(bounds.height) && position(bounds.x) && position(bounds.y) &&
    typeof bounds.maximized === 'boolean'
}

/** Returns true when the value fits the setting's type and limits. */
export function isValidSettingValue(definition: SettingDefinition, value: unknown): value is SettingValue {
  switch (definition.type) {
    case 'choice':
      return typeof value === 'string' && definition.options.some((option) => option.value === value)
    case 'color':
      return typeof value === 'string' && COLOR.test(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return isFiniteNumber(value) &&
        (definition.min === undefined || value >= definition.min) &&
        (definition.max === undefined || value <= definition.max)
    case 'text':
      return typeof value === 'string' && value.length <= (definition.maxLength ?? MAX_TEXT_LENGTH) && !CONTROL.test(value)
    case 'bounds':
      return isBounds(value)
  }
}

/** Throws on badly formed keys, duplicate keys and defaults that do not fit their own setting. */
export function checkSettingDefinitions(definitions: readonly SettingDefinition[]): void {
  const keys = new Set<string>()
  for (const definition of definitions) {
    if (!KEY.test(definition.key)) {
      throw new Error(`Invalid setting key "${definition.key}"`)
    }
    if (keys.has(definition.key)) {
      throw new Error(`Duplicate setting key "${definition.key}"`)
    }
    keys.add(definition.key)
    const fallback: unknown = definition.default
    if (!isValidSettingValue(definition, fallback)) {
      throw new Error(`Setting "${definition.key}" has an invalid default`)
    }
  }
}
