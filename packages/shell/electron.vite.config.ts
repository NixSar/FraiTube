import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// Workspace packages ship TypeScript sources, so main and preload bundle every dependency.
export default defineConfig({
  main: {
    build: {
      externalizeDeps: false
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
      isolatedEntries: true,
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/preload/index.ts'),
          botguard: resolve(import.meta.dirname, 'src/preload/botguard.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [vue()]
  }
})
