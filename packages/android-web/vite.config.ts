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
      // The shared packages use a few Node modules; the web view has its own stand-ins for them.
      'node:crypto': resolve(here, 'src/shims/crypto.ts'),
      'node:fs/promises': resolve(here, 'src/shims/fs.ts'),
      'node:path': resolve(here, 'src/shims/path.ts'),
      'node:zlib': resolve(here, 'src/shims/zlib.ts'),
      'node:sqlite': resolve(here, 'src/shims/sqlite.ts'),
      'node:vm': resolve(here, 'src/shims/vm.ts')
    }
  },
  build: {
    outDir: resolve(here, '../../android/app/src/main/assets/web'),
    emptyOutDir: true,
    // CSS is left as written, so the build needs no lightningcss, whose prebuilt binary F-Droid does not take.
    cssMinify: false,
    rolldownOptions: {
      input: {
        index: resolve(here, 'index.html'),
        hidden: resolve(here, 'hidden.html')
      }
    }
  }
})
