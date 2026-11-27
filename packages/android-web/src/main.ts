import { installAndroid } from './android'
import { createBridge } from './bridge'

// The screens expect the bridge to be in place before they load.
installAndroid()
window.fraitube = createBridge()
await import('../../shell/src/renderer/main')
