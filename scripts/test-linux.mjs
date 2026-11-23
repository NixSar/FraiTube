import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Runs on Windows. Copies the files that would be committed into Ubuntu under WSL 2, runs the checks there,
// makes the AppImage and starts it. Ubuntu keeps its own copy, so its Linux packages never mix with the Windows ones.
const DISTRO = 'Ubuntu'
const COPY = 'fraitube-linux'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const archive = join('release', 'linux-source.tar')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', ...options })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  return result
}

const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { stdio: ['ignore', 'pipe', 'inherit'] }).stdout
mkdirSync(join(projectRoot, 'release'), { recursive: true })
run('tar', ['-cf', archive, '--null', '-T', '-'], { input: files, stdio: ['pipe', 'inherit', 'inherit'] })

const steps = [
  'set -euo pipefail',
  'source="$PWD"',
  'cd',
  `mkdir -p ${COPY}`,
  `cd ${COPY}`,
  'find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .pnpm-store ! -name .electron-cache -exec rm -rf {} +',
  `tar -xf "$source/${archive.replaceAll('\\', '/')}"`,
  'pnpm install --frozen-lockfile',
  'pnpm typecheck',
  'pnpm lint',
  'pnpm test',
  'pnpm package',
  'app=$(ls release/*.AppImage | head -n 1)',
  'echo "Starting $app"',
  '"$app" --appimage-extract-and-run'
]

// --exec hands the steps to bash as they are, without another shell reading them first.
run('wsl', ['-d', DISTRO, '--exec', 'bash', '-lc', steps.join('\n')])
