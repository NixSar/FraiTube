import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Packs the built app for the system this runs on. The tools electron-builder downloads stay in the project.
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const shellDir = join(projectRoot, 'packages', 'shell')
const cacheDir = join(projectRoot, '.electron-cache')
process.env.ELECTRON_BUILDER_CACHE = join(cacheDir, 'electron-builder')

// The downloaded tools are CommonJS scripts, so the project's "type": "module" must not apply to them.
mkdirSync(cacheDir, { recursive: true })
writeFileSync(join(cacheDir, 'package.json'), '{ "type": "commonjs" }\n')

const require = createRequire(join(shellDir, 'package.json'))
const { build } = require('electron-builder')

await build({ projectDir: shellDir })
