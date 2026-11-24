import { shallowRef, type ShallowRef } from 'vue'
import type { DownloadState, UpdateState } from '../shared/updates'

/** The last update check and the installer download, shared by the banner and the About page and kept current. */
const state = shallowRef<UpdateState>({ status: 'idle', currentVersion: '' })
const download = shallowRef<DownloadState>({ status: 'idle', received: 0, total: 0, action: 'show' })
/** Why the download or the installer could not start, when the main process refused it. */
const actionError = shallowRef('')
let started = false

function start(): void {
  if (started) return
  started = true
  window.fraitube.onUpdateStateChanged((next) => {
    state.value = next
  })
  window.fraitube.onUpdateDownloadChanged((next) => {
    download.value = next
  })
  window.fraitube.getUpdateState().then((found) => {
    state.value = found.state
    download.value = found.download
  }, () => {
    // Nothing shows until the next check.
  })
}

function reportError(cause: unknown): void {
  actionError.value = cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(cause)
}

export interface Updates {
  state: ShallowRef<UpdateState>
  download: ShallowRef<DownloadState>
  actionError: ShallowRef<string>
  check(): void
  startDownload(): void
  install(): void
}

/** The update check and download, kept current as they change in the main process. */
export function useUpdates(): Updates {
  start()
  return {
    state,
    download,
    actionError,
    check() {
      actionError.value = ''
      window.fraitube.checkForUpdates().catch(reportError)
    },
    startDownload() {
      actionError.value = ''
      window.fraitube.downloadUpdate().catch(reportError)
    },
    install() {
      actionError.value = ''
      window.fraitube.installUpdate().catch(reportError)
    }
  }
}
