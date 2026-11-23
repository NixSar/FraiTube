import { reactive, readonly } from 'vue'
import type { SettingValue } from '@fraitube/app-api/settings'

const values = reactive<Record<string, SettingValue>>({})

/** Current setting values, kept in step with every other window. */
export const settings = readonly(values)

/** Loads all settings and follows changes made in any window. Call once before mounting the app. */
export async function loadSettings(): Promise<void> {
  Object.assign(values, await window.fraitube.getSettings())
  window.fraitube.onSettingChanged((key, value) => {
    values[key] = value
  })
}

/** Saves one setting. The page shows the new value at once and goes back to the old one if saving fails. */
export async function setSetting(key: string, value: SettingValue): Promise<void> {
  const previous = values[key]
  values[key] = value
  try {
    await window.fraitube.setSetting(key, value)
  } catch (error) {
    if (previous !== undefined) {
      values[key] = previous
    }
    throw error
  }
}
