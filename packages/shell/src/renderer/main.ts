import { createApp } from 'vue'
import App from './App.vue'
import { installedModules } from './modules'
import { buildRegistry, registryKey } from './registry'
import { createAppRouter } from './router'
import { loadSettings, settings } from './settings'
import { applyTheme } from './theme'
import { SettingKey, startPageRoute } from '../shared/settings'
import './styles.css'

const registry = buildRegistry(installedModules)

await loadSettings()
applyTheme()

createApp(App, { nav: registry.nav, frames: registry.frames, navPanels: registry.navPanels })
  .provide(registryKey, registry)
  .use(createAppRouter(registry, () => startPageRoute(settings[SettingKey.startPage])))
  .mount('#app')
