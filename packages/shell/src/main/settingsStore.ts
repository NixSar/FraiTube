import {
  checkSettingDefinitions,
  isValidSettingValue,
  type SettingDefinition,
  type SettingValue
} from '@fraitube/app-api/settings'
import { createRecordTableSql, type ModuleSchema, type Storage } from '@fraitube/storage'

/** Synced settings and local settings live in separate tables; sync reads only `settings`. */
export const settingsSchema: ModuleSchema = {
  module: 'settings',
  migrations: [{ version: 1, up: createRecordTableSql('settings') + createRecordTableSql('local_settings') }],
  synced: ['settings']
}

export interface SettingsStore {
  get(key: string): SettingValue
  getAll(): Record<string, SettingValue>
  /** Checks and saves one value. Throws for unknown keys and values that do not fit. */
  set(key: string, value: unknown): SettingValue
}

export function createSettingsStore(storage: Storage, definitions: readonly SettingDefinition[]): SettingsStore {
  checkSettingDefinitions(definitions)
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const synced = storage.records<SettingValue>('settings')
  const local = storage.records<SettingValue>('local_settings')

  function definitionOf(key: string): SettingDefinition {
    const definition = byKey.get(key)
    if (!definition) {
      throw new Error(`Unknown setting "${key}"`)
    }
    return definition
  }

  // A stored number outside its range reads as the nearest limit.
  // Any other stored value that no longer fits its definition, for example after an option was removed, reads as the default.
  function read(definition: SettingDefinition): SettingValue {
    let stored = (definition.local ? local : synced).get(definition.key)
    if (definition.type === 'number' && typeof stored === 'number' && Number.isFinite(stored)) {
      stored = Math.min(Math.max(stored, definition.min ?? stored), definition.max ?? stored)
    }
    return isValidSettingValue(definition, stored) ? stored : definition.default
  }

  return {
    get(key) {
      return read(definitionOf(key))
    },
    getAll() {
      return Object.fromEntries(definitions.map((definition) => [definition.key, read(definition)]))
    },
    set(key, value) {
      const definition = definitionOf(key)
      if (!isValidSettingValue(definition, value)) {
        throw new Error(`Invalid value for setting "${key}"`)
      }
      ;(definition.local ? local : synced).put(key, value)
      return value
    }
  }
}
