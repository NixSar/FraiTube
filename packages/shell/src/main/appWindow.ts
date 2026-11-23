import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'

/** Only app windows may use the bridge, never the offscreen BotGuard page. */
export function fromAppWindow(event: Pick<IpcMainInvokeEvent, 'sender'>): boolean {
  return BrowserWindow.fromWebContents(event.sender) !== null
}
