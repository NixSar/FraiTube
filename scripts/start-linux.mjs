import { runInUbuntuCopy } from './ubuntu-copy.mjs'

// Runs on Windows. Brings Ubuntu's copy under WSL 2 up to the project's files, then builds FraiTube
// there and opens it, as start.cmd does on Windows.
runInUbuntuCopy(['sh start.sh'])
