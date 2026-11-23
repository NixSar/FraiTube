import { join } from 'node:path'
import { session, WebContentsView, type Session } from 'electron'
import type { PoTokenRequest } from '@fraitube/youtube'
import { YOUTUBE_ACCEPT_LANGUAGES } from './headers'

// BotGuard needs a real page with `window` and `document`. It runs in an offscreen view with its own
// in-memory session, so it never shares cookies or storage with the rest of the app.
// Based on FreeTube's src/main/poTokenGenerator.js.

let queue: Promise<unknown> = Promise.resolve()

/** Runs tasks one after another, so one session can be cleared between tokens. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task)
  queue = result.catch(() => undefined)
  return result
}

let botGuardSession: Session | undefined

function getSession(userAgent: string): Session {
  if (botGuardSession) {
    return botGuardSession
  }

  const created = session.fromPartition('botguard', { cache: false })
  created.setPermissionCheckHandler(() => false)
  created.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  created.setUserAgent(userAgent, YOUTUBE_ACCEPT_LANGUAGES)

  created.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.google.com/js/*', 'https://www.youtube.com/youtubei/*'] },
    ({ requestHeaders, url }, callback) => {
      if (url.startsWith('https://www.youtube.com/youtubei/')) {
        requestHeaders['Referer'] = 'https://www.youtube.com/'
        requestHeaders['Origin'] = 'https://www.youtube.com'
        requestHeaders['Sec-Fetch-Site'] = 'same-origin'
        requestHeaders['Sec-Fetch-Mode'] = 'same-origin'
        requestHeaders['X-Youtube-Bootstrap-Logged-In'] = 'false'
      } else {
        requestHeaders['Sec-Fetch-Dest'] = 'script'
        requestHeaders['Sec-Fetch-Site'] = 'cross-site'
        requestHeaders['Accept-Language'] = '*'
      }
      callback({ requestHeaders })
    }
  )

  created.webRequest.onHeadersReceived({ urls: ['https://*/*'] }, ({ responseHeaders }, callback) => {
    callback({
      responseHeaders: {
        ...responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH']
      }
    })
  })

  created.webRequest.onBeforeRequest({ urls: ['<all_urls>'], types: ['cspReport', 'ping'] }, (_details, callback) => {
    callback({ cancel: true })
  })

  botGuardSession = created
  return created
}

async function mint(request: PoTokenRequest, userAgent: string): Promise<string> {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'botguard.js'),
      session: getSession(userAgent),
      sandbox: true,
      contextIsolation: false,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
      safeDialogs: true,
      v8CacheOptions: 'none'
    }
  })

  const contents = view.webContents
  try {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.setAudioMuted(true)
    view.setBounds({ x: 0, y: 0, width: 1920, height: 1080 })

    contents.debugger.attach()
    await contents.loadURL(
      'data:text/html,<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
      { baseURLForDataURL: 'https://www.youtube.com/' }
    )
    await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1920,
      screenHeight: 1080,
      positionX: 0,
      positionY: 0,
      screenOrientation: { type: 'landscapePrimary', angle: 0 }
    })

    const token: unknown = await contents.executeJavaScript(`window.fraitubeMintPoToken(${JSON.stringify(request)})`)
    if (typeof token !== 'string' || token === '') {
      throw new Error('BotGuard returned no token')
    }
    return token
  } finally {
    contents.close({ waitForBeforeUnload: false })
  }
}

async function clearSession(): Promise<void> {
  if (botGuardSession) {
    await botGuardSession.closeAllConnections()
    await botGuardSession.clearData()
  }
}

/** Mints a proof of origin token for one video. */
export function createPoTokenMinter(userAgent: string): (request: PoTokenRequest) => Promise<string> {
  return (request) => {
    const token = enqueue(() => mint(request, userAgent))
    void enqueue(clearSession)
    return token
  }
}
