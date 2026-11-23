import { ref, watchEffect } from 'vue'
import { SettingKey } from '../shared/settings'
import { settings } from './settings'

/** Applies the theme and accent color settings to the page, and follows the system's light or dark mode. */
export function applyTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })

  watchEffect(() => {
    const root = document.documentElement
    const theme = String(settings[SettingKey.theme] ?? 'system')
    root.dataset['theme'] = theme === 'system' ? (systemDark.value ? 'dark' : 'light') : theme
    root.style.setProperty('--color-accent', String(settings[SettingKey.accent] ?? '#3d7bd9'))
  })
}
