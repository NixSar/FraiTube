import { ipcMain, session, type Session } from 'electron'
import { createYoutube } from '@fraitube/youtube'
import { isVideoId } from '@fraitube/youtube/ids'
import { isChannelId } from '@fraitube/subscriptions'
import {
  IpcChannel,
  isChannelVideosRequest,
  isCommentsRequest,
  isProxyRequest,
  isReloadToken,
  isSearchRequest,
  isSuggestionText,
  isTrackId,
  type ProxyResponse
} from '../shared/bridge'
import { fromAppWindow } from './appWindow'
import {
  CAPTION_URL_PATTERNS,
  captionRequestHeaders,
  isCaptionUrl,
  isPageUrl,
  PAGE_URL_PATTERNS,
  pageRequestHeaders,
  YOUTUBE_ACCEPT_LANGUAGES
} from './headers'
import { createPlaybackCache } from './playbackCache'
import { createPoTokenMinter } from './potoken'

/**
 * All YouTube traffic goes through Chromium's network stack on an in-memory session
 * that never keeps cookies, so nothing ties one request to the next.
 */
function createYoutubeSession(userAgent: string): Session {
  const youtubeSession = session.fromPartition('youtube', { cache: false })
  youtubeSession.setUserAgent(userAgent, YOUTUBE_ACCEPT_LANGUAGES)
  youtubeSession.setPermissionCheckHandler(() => false)
  youtubeSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  youtubeSession.webRequest.onHeadersReceived(({ responseHeaders }, callback) => {
    const headers = { ...responseHeaders }
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'set-cookie') {
        delete headers[name]
      }
    }
    callback({ responseHeaders: headers })
  })
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // A session has one header listener, so it handles both kinds of request.
  const urls = [...PAGE_URL_PATTERNS, ...CAPTION_URL_PATTERNS]
  youtubeSession.webRequest.onBeforeSendHeaders({ urls }, ({ url, requestHeaders }, callback) => {
    if (isPageUrl(url)) {
      callback({ requestHeaders: pageRequestHeaders(requestHeaders, timeZone) })
    } else if (isCaptionUrl(url)) {
      callback({ requestHeaders: captionRequestHeaders(requestHeaders) })
    } else {
      callback({ requestHeaders })
    }
  })
  return youtubeSession
}

/** What other main process modules use of the YouTube connection. */
export interface YoutubeAccess {
  fetch: typeof fetch
  getChannelIcon(channelId: string): Promise<string>
}

/** Registers the YouTube handlers and returns what other main process modules use of the connection. */
export function registerNetworkHandlers(userAgent: string): YoutubeAccess {
  const youtubeSession = createYoutubeSession(userAgent)
  const youtubeFetch: typeof fetch = (input, init) => youtubeSession.fetch(input instanceof URL ? input.href : input, init)
  const youtube = createYoutube({ userAgent, fetch: youtubeFetch, mintPoToken: createPoTokenMinter(userAgent) })
  youtube.startSession()

  ipcMain.handle(IpcChannel.fetch, async (event, request: unknown): Promise<ProxyResponse> => {
    if (!fromAppWindow(event) || !isProxyRequest(request)) {
      throw new Error('Request refused')
    }

    const response = await youtubeFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      body: new Uint8Array(await response.arrayBuffer())
    }
  })

  const playbacks = createPlaybackCache((videoId, onDetails) => youtube.getPlayback(videoId, onDetails))
  ipcMain.handle(IpcChannel.playback, (event, videoId: unknown, fresh: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId) || (fresh !== undefined && typeof fresh !== 'boolean')) {
      throw new Error('Request refused')
    }
    return playbacks.get(videoId, fresh === true)
  })

  ipcMain.handle(IpcChannel.videoDetails, (event, videoId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    return playbacks.details(videoId)
  })

  ipcMain.handle(IpcChannel.refreshPoToken, (event, videoId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId)) {
      throw new Error('Request refused')
    }
    return youtube.refreshPoToken(videoId)
  })

  ipcMain.handle(IpcChannel.search, (event, request: unknown) => {
    if (!fromAppWindow(event) || !isSearchRequest(request)) {
      throw new Error('Request refused')
    }
    return youtube.search({ query: request.query.trim(), filter: request.filter, continuation: request.continuation })
  })

  ipcMain.handle(IpcChannel.searchSuggestions, (event, text: unknown) => {
    if (!fromAppWindow(event) || !isSuggestionText(text)) {
      throw new Error('Request refused')
    }
    return youtube.getSearchSuggestions(text)
  })

  ipcMain.handle(IpcChannel.channelVideos, (event, request: unknown) => {
    if (!fromAppWindow(event) || !isChannelVideosRequest(request) || !isChannelId(request.channelId)) {
      throw new Error('Request refused')
    }
    return youtube.getChannelVideos({ channelId: request.channelId, query: request.query?.trim(), continuation: request.continuation })
  })

  ipcMain.handle(IpcChannel.captions, (event, videoId: unknown, trackId: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId) || !isTrackId(trackId)) {
      throw new Error('Request refused')
    }
    return youtube.getCaptions(videoId, trackId)
  })

  ipcMain.handle(IpcChannel.comments, (event, request: unknown) => {
    if (!fromAppWindow(event) || !isCommentsRequest(request) || !isVideoId(request.videoId)) {
      throw new Error('Request refused')
    }
    return youtube.getComments({ videoId: request.videoId, sort: request.sort, continuation: request.continuation })
  })

  ipcMain.handle(IpcChannel.reloadStreaming, (event, videoId: unknown, reloadToken: unknown) => {
    if (!fromAppWindow(event) || !isVideoId(videoId) || !isReloadToken(reloadToken)) {
      throw new Error('Request refused')
    }
    return youtube.reloadStreaming(videoId, reloadToken)
  })

  return { fetch: youtubeFetch, getChannelIcon: (channelId) => youtube.getChannelIcon(channelId) }
}
