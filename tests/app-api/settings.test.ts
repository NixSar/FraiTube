import { describe, expect, it } from 'vitest'
import { checkSettingDefinitions, isValidSettingValue, MAX_TEXT_LENGTH, type SettingDefinition } from '../../packages/app-api/src/settings'

const theme: SettingDefinition = {
  key: 'appearance.theme',
  label: 'Theme',
  type: 'choice',
  options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }],
  default: 'dark'
}
const volume: SettingDefinition = { key: 'player.volume', label: 'Volume', type: 'number', default: 100, min: 0, max: 400 }
const bounds: SettingDefinition = {
  key: 'window.bounds',
  label: 'Window',
  type: 'bounds',
  default: { width: 1200, height: 800, maximized: false },
  local: true,
  hidden: true
}

describe('checkSettingDefinitions', () => {
  it('accepts well-formed definitions', () => {
    expect(() => checkSettingDefinitions([theme, volume, bounds])).not.toThrow()
  })

  it('refuses bad keys, duplicate keys and invalid defaults', () => {
    expect(() => checkSettingDefinitions([{ ...theme, key: 'theme' }])).toThrow('Invalid setting key')
    expect(() => checkSettingDefinitions([{ ...theme, key: 'Appearance.theme' }])).toThrow('Invalid setting key')
    expect(() => checkSettingDefinitions([theme, theme])).toThrow('Duplicate setting key')
    expect(() => checkSettingDefinitions([{ ...theme, default: 'pink' }])).toThrow('invalid default')
    expect(() => checkSettingDefinitions([{ ...volume, default: 500 }])).toThrow('invalid default')
  })
})

describe('isValidSettingValue', () => {
  it('checks choices', () => {
    expect(isValidSettingValue(theme, 'light')).toBe(true)
    expect(isValidSettingValue(theme, 'pink')).toBe(false)
    expect(isValidSettingValue(theme, 1)).toBe(false)
  })

  it('checks colors', () => {
    const accent: SettingDefinition = { key: 'appearance.accent', label: 'Accent', type: 'color', default: '#3d7bd9' }
    expect(isValidSettingValue(accent, '#A0b1C2')).toBe(true)
    expect(isValidSettingValue(accent, 'red')).toBe(false)
    expect(isValidSettingValue(accent, '#fff')).toBe(false)
  })

  it('checks booleans and number limits', () => {
    const flag: SettingDefinition = { key: 'a.flag', label: 'Flag', type: 'boolean', default: false }
    expect(isValidSettingValue(flag, true)).toBe(true)
    expect(isValidSettingValue(flag, 'true')).toBe(false)
    expect(isValidSettingValue(volume, 250)).toBe(true)
    expect(isValidSettingValue(volume, -1)).toBe(false)
    expect(isValidSettingValue(volume, Number.NaN)).toBe(false)
  })

  it('checks text length and control characters', () => {
    const language: SettingDefinition = { key: 'subtitles.language', label: 'Language', type: 'text', default: 'en', maxLength: 5 }
    const note: SettingDefinition = { key: 'notes.text', label: 'Note', type: 'text', default: '' }
    expect(isValidSettingValue(language, 'en-GB')).toBe(true)
    expect(isValidSettingValue(language, '')).toBe(true)
    expect(isValidSettingValue(language, 'en-GB-x')).toBe(false)
    expect(isValidSettingValue(language, 5)).toBe(false)
    expect(isValidSettingValue(note, 'a'.repeat(MAX_TEXT_LENGTH))).toBe(true)
    expect(isValidSettingValue(note, 'a'.repeat(MAX_TEXT_LENGTH + 1))).toBe(false)
    expect(isValidSettingValue(note, 'line\nbreak')).toBe(false)
  })

  it('checks window bounds', () => {
    expect(isValidSettingValue(bounds, { x: -50, y: 10, width: 800, height: 600, maximized: true })).toBe(true)
    expect(isValidSettingValue(bounds, { width: 800, height: 600, maximized: false })).toBe(true)
    expect(isValidSettingValue(bounds, { width: 0, height: 600, maximized: false })).toBe(false)
    expect(isValidSettingValue(bounds, { width: 800, height: 600 })).toBe(false)
    expect(isValidSettingValue(bounds, null)).toBe(false)
  })
})
