import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = import.meta.dirname

// Builds the app page and the hidden page into the Android app's packed pages folder.
export default defineConfig({
  root: here,
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      // The shared packages use three Node modules; the web view has its own stand-ins for them.
      'node:crypto': resolve(here, 'src/shims/crypto.ts'),
      'node:sqlite': resolve(here, 'src/shims/sqlite.ts'),
      'node:vm': resolve(here, 'src/shims/vm.ts')
    }
  },
  build: {
    outDir: resolve(here, '../../android/app/src/main/assets/web'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: resolve(here, 'index.html'),
        hidden: resolve(here, 'hidden.html')
      }
    }
  }
})
