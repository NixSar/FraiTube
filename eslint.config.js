import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      'android/**',
      '.project/**',
      '.pnpm-store/**',
      '.electron-cache/**'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['packages/shell/src/renderer/**'],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: [
      'packages/shell/src/main/**',
      'packages/shell/src/preload/**',
      'scripts/**',
      'tests/**',
      '**/*.config.{js,ts}'
    ],
    languageOptions: {
      globals: globals.node
    }
  }
)
