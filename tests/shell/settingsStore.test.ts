import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SettingDefinition } from '../../packages/app-api/src/settings'
import { createSettingsStore, settingsSchema } from '../../packages/shell/src/main/settingsStore'
import { allSettingDefinitions } from '../../packages/shell/src/shared/settings'
import { openStorage, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'

const dir = join(TEST_DATA_DIR, 'settings')
const opened: Storage[] = []
const files: string[] = []

function open(): Storage {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  const storage = openStorage(file, [settingsSchema])
  opened.push(storage)
  return storage
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const file of files.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(file + suffix, { force: true })
    }
  }
})

const definitions: SettingDefinition[] = [
  { key: 'appearance.theme', label: 'Theme', type: 'choice', options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], default: 'dark' },
  { key: 'window.bounds', label: 'Window', type: 'bounds', default: { width: 1200, height: 800, maximized: false }, local: true }
]

describe('createSettingsStore', () => {
  it('returns defaults until a value is saved', () => {
    const store = createSettingsStore(open(), definitions)
    expect(store.getAll()).toEqual({ 'appearance.theme': 'dark', 'window.bounds': { width: 1200, height: 800, maximized: false } })

    store.set('appearance.theme', 'light')
    expect(store.get('appearance.theme')).toBe('light')
  })

  it('keeps local settings out of the synced table', () => {
    const storage = open()
    const store = createSettingsStore(storage, definitions)
    const bounds = { x: 10, y: 20, width: 900, height: 700, maximized: true }
    store.set('appearance.theme', 'light')
    store.set('window.bounds', bounds)

    expect(storage.records('settings').list()).toEqual([{ key: 'appearance.theme', value: 'light' }])
    expect(storage.records('local_settings').list()).toEqual([{ key: 'window.bounds', value: bounds }])
  })

  it('refuses unknown keys and values that do not fit', () => {
    const store = createSettingsStore(open(), definitions)
    expect(() => store.set('appearance.missing', 'x')).toThrow('Unknown setting')
    expect(() => store.set('appearance.theme', 'pink')).toThrow('Invalid value')
    expect(store.get('appearance.theme')).toBe('dark')
  })

  it('reads a stored value that no longer fits as the default', () => {
    const storage = open()
    storage.records('settings').put('appearance.theme', 'removed-theme')
    expect(createSettingsStore(storage, definitions).get('appearance.theme')).toBe('dark')
  })

  it('reads a stored number outside its range as the nearest limit', () => {
    const storage = open()
    const volume: SettingDefinition = { key: 'player.volume', label: 'Volume', type: 'number', min: 0, max: 200, default: 100, local: true }
    storage.records('local_settings').put('player.volume', 400)
    expect(createSettingsStore(storage, [volume]).get('player.volume')).toBe(200)
    storage.records('local_settings').put('player.volume', -5)
    expect(createSettingsStore(storage, [volume]).get('player.volume')).toBe(0)
  })

  it('accepts the app\'s own setting definitions', () => {
    expect(() => createSettingsStore(open(), allSettingDefinitions())).not.toThrow()
  })
})
