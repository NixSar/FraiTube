import { runInUbuntuCopy } from './ubuntu-copy.mjs'

// Runs on Windows. Brings Ubuntu's copy under WSL 2 up to the project's files, runs the checks there,
// makes the AppImage and starts it.
runInUbuntuCopy([
  'pnpm typecheck',
  'pnpm lint',
  'pnpm test',
  'pnpm package',
  'app=$(ls release/*.AppImage | head -n 1)',
  'echo "Starting $app"',
  '"$app" --appimage-extract-and-run'
])
