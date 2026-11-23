import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(projectRoot, 'packages', 'shell', 'package.json'))
const installScript = require.resolve('electron/install.js')

const result = spawnSync(process.execPath, [installScript], {
  stdio: 'inherit',
  env: {
    ...process.env,
    electron_config_cache: join(projectRoot, '.electron-cache')
  }
})

process.exit(result.status ?? 1)
