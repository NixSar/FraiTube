import type { SettingValue } from '@fraitube/app-api/settings'
import type { Channel, Feed, ImportSummary, Subscription } from '@fraitube/subscriptions/types'
import type {
  CaptionCue,
  ChannelVideosPage,
  ChannelVideosRequest,
  CommentPage,
  CommentsRequest,
  SearchPage,
  SearchRequest,
  StreamingReload,
  VideoDetails,
  VideoPlayback
} from '@fraitube/youtube/types'
import type { Segment } from '@fraitube/sponsorblock/types'
import type { BackupStatus } from './backupSettings'
import type { Favorite } from './favorites'
import type { HistoryEntry, HistoryImportSummary, HistoryVideo } from './history'
import type { HandOver } from './pip'
import type { PastSearch } from './searchHistory'
import type { RcloneRemotes, SyncStatus } from './syncSettings'
import type { DownloadState, UpdateState } from './updates'

/** IPC channel names shared by the main process and the preload script. */
export const IpcChannel = {
  openWindow: 'window:open',
  fetch: 'net:fetch',
  playback: 'youtube:playback',
  videoDetails: 'youtube:details',
  refreshPoToken: 'youtube:potoken',
  getSettings: 'settings:get',
  setSetting: 'settings:set',
  settingChanged: 'settings:changed',
  search: 'youtube:search',
  searchSuggestions: 'youtube:search-suggestions',
  channelVideos: 'youtube:channel-videos',
  captions: 'youtube:captions',
  comments: 'youtube:comments',
  reloadStreaming: 'youtube:reload-streaming',
  listSubscriptions: 'subscriptions:list',
  subscribe: 'subscriptions:subscribe',
  unsubscribe: 'subscriptions:unsubscribe',
  clearSubscriptions: 'subscriptions:clear',
  importSubscriptions: 'subscriptions:import',
  feed: 'subscriptions:feed',
  feedProgress: 'subscriptions:feed-progress',
  subscriptionsChanged: 'subscriptions:changed',
  listHistory: 'history:list',
  recordHistory: 'history:record',
  saveHistoryPosition: 'history:position',
  removeHistory: 'history:remove',
  markWatched: 'history:mark-watched',
  markUnwatched: 'history:mark-unwatched',
  clearHistory: 'history:clear',
  importHistory: 'history:import',
  historyChanged: 'history:changed',
  historyPositionSaved: 'history:position-saved',
  listFavorites: 'favorites:list',
  addFavorite: 'favorites:add',
  removeFavorite: 'favorites:remove',
  favoritesChanged: 'favorites:changed',
  listSearchHistory: 'search-history:list',
  addSearch: 'search-history:add',
  removeSearch: 'search-history:remove',
  clearSearchHistory: 'search-history:clear',
  searchHistoryChanged: 'search-history:changed',
  appInfo: 'app:info',
  openDataFolder: 'app:open-data-folder',
  updateState: 'updates:state',
  checkForUpdates: 'updates:check',
  downloadUpdate: 'updates:download',
  installUpdate: 'updates:install',
  updateStateChanged: 'updates:state-changed',
  updateDownloadChanged: 'updates:download-changed',
  sponsorSegments: 'sponsorblock:segments',
  pausePlayback: 'player:pause',
  openPip: 'pip:open',
  closePip: 'pip:close',
  pipBack: 'pip:back',
  movePip: 'pip:move',
  pipReturned: 'pip:returned',
  takeOverPlayback: 'pip:take-over',
  handOverRequested: 'pip:hand-over-requested',
  handedOver: 'pip:handed-over',
  syncStatus: 'sync:status',
  syncNow: 'sync:now',
  chooseSyncFolder: 'sync:choose-folder',
  chooseRcloneProgram: 'sync:choose-rclone',
  rcloneRemotes: 'sync:rclone-remotes',
  syncStatusChanged: 'sync:status-changed',
  backupStatus: 'backup:status',
  createBackup: 'backup:create',
  restoreBackup: 'backup:restore',
  backupStatusChanged: 'backup:status-changed'
} as const

/** How far a feed fetch has come, while channels are still being fetched. */
export interface FeedProgress {
  /** IDs of the channels fetched so far. */
  fetchedChannelIds: string[]
  /** Channels fetched so far. */
  fetched: number
  /** Channels being fetched. */
  total: number
}

/** A network request a page asks the main process to make. */
export interface ProxyRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: Uint8Array<ArrayBuffer>
}

export interface ProxyResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: Uint8Array<ArrayBuffer>
}

/** The API the preload script exposes to pages as `window.fraitube`. */
export interface FraiTubeBridge {
  /** Opens the given in-app path, for example "/subscriptions", in a new window. */
  openWindow(path: string): void
  /** Makes a request to YouTube or its video servers through the main process. */
  fetch(request: ProxyRequest): Promise<ProxyResponse>
  /** What is needed to play one video, reused for 10 minutes unless `fresh` asks to fetch it again. */
  getPlayback(videoId: string, fresh?: boolean): Promise<VideoPlayback>
  /** What the watch page shows about a video, as soon as it is known, before the video can play. */
  getVideoDetails(videoId: string): Promise<VideoDetails>
  /** Mints a fresh proof of origin token for a loaded video after YouTube rejected the old one. */
  refreshPoToken(videoId: string): Promise<string>
  /** Every setting's current value, keyed by setting key. */
  getSettings(): Promise<Record<string, SettingValue>>
  /** Saves one setting; every open window then receives the change. */
  setSetting(key: string, value: SettingValue): Promise<void>
  /** Calls the listener whenever a setting changes in any window. Returns a function that stops listening. */
  onSettingChanged(listener: (key: string, value: SettingValue) => void): () => void
  /** Searches YouTube, or loads the next page of an earlier search. */
  search(request: SearchRequest): Promise<SearchPage>
  /** The searches YouTube suggests for a typed text, at most MAX_QUERY_LENGTH characters. Absent where the app gives no suggestions. */
  getSearchSuggestions?(text: string): Promise<string[]>
  /** A channel and its videos newest first, or its videos that match a search, or the next page of either. */
  getChannelVideos(request: ChannelVideosRequest): Promise<ChannelVideosPage>
  /** Loads one subtitle track of a video that was loaded with getPlayback. */
  getCaptions(videoId: string, trackId: string): Promise<CaptionCue[]>
  /** Loads comments, more comments or replies of a video loaded with getPlayback or getVideoDetails. */
  getComments(request: CommentsRequest): Promise<CommentPage>
  /** Fresh streaming data for a loaded video, when its SABR server asks for a reload during playback. */
  reloadStreaming(videoId: string, reloadToken?: string): Promise<StreamingReload>
  /** Every subscription, by channel name. */
  listSubscriptions(): Promise<Subscription[]>
  subscribe(channel: Channel): Promise<void>
  unsubscribe(channelId: string): Promise<void>
  /** Unsubscribes from every channel. */
  clearSubscriptions(): Promise<void>
  /** Asks for a FreeTube or NewPipe file and subscribes to its channels. Undefined when no file was chosen. */
  importSubscriptions(): Promise<ImportSummary | undefined>
  /** New videos of every subscribed channel; a refresh fetches them again even while the last load is fresh. */
  getFeed(refresh: boolean): Promise<Feed>
  /** Calls the listener with the channels fetched so far while the feed is fetched. Returns a function that stops listening. */
  onFeedProgress(listener: (progress: FeedProgress) => void): () => void
  /** Calls the listener whenever subscriptions change in any window. Returns a function that stops listening. */
  onSubscriptionsChanged(listener: () => void): () => void
  /** Every watched video, last watched first. */
  listHistory(): Promise<HistoryEntry[]>
  /** Records that a video was opened, and returns its entry with the saved position. */
  recordHistory(video: HistoryVideo): Promise<HistoryEntry>
  /** Saves where a recorded video stopped, without waiting, so it also works while the window closes. */
  saveHistoryPosition(videoId: string, positionSeconds: number): void
  removeHistory(videoId: string): Promise<void>
  /** Marks a video as watched, adding it to the history when it is not there. */
  markWatched(video: HistoryVideo): Promise<void>
  /** Marks a video as unwatched, keeping it in the history with its position. */
  markUnwatched(videoId: string): Promise<void>
  clearHistory(): Promise<void>
  /** Asks for a FreeTube history file or NewPipe backup and adds its videos. Undefined when no file was chosen. */
  importHistory(): Promise<HistoryImportSummary | undefined>
  /** Calls the listener whenever the history changes in any window. Returns a function that stops listening. */
  onHistoryChanged(listener: () => void): () => void
  /** Calls the listener whenever a video's position is saved in any window. Returns a function that stops listening. */
  onHistoryPositionSaved(listener: (videoId: string, positionSeconds: number) => void): () => void
  /** Every favorite video, the last added first. */
  listFavorites(): Promise<Favorite[]>
  /** Adds a video to the favorites; every open window then hears of the change. */
  addFavorite(video: HistoryVideo): Promise<void>
  removeFavorite(videoId: string): Promise<void>
  /** Calls the listener whenever the favorites change in any window. Returns a function that stops listening. */
  onFavoritesChanged(listener: () => void): () => void
  /** The kept searches, newest first. */
  listSearchHistory(): Promise<PastSearch[]>
  /** Saves a search as the newest while Remember searches is on; every open window then hears of the change. */
  addSearch(query: string): Promise<void>
  removeSearch(query: string): Promise<void>
  clearSearchHistory(): Promise<void>
  /** Calls the listener whenever the search history changes in any window or through sync. Returns a function that stops listening. */
  onSearchHistoryChanged(listener: () => void): () => void
  /** The app's version and the folder where this computer's data is kept. */
  getAppInfo(): Promise<{ version: string; dataFolder: string }>
  /** Opens the data folder in the system's file manager. */
  openDataFolder(): void
  /** The last update check's result and the installer download's progress. */
  getUpdateState(): Promise<{ state: UpdateState; download: DownloadState }>
  /** Asks GitHub for the latest release, or waits for the check already running, and returns the result. */
  checkForUpdates(): Promise<UpdateState>
  /** Downloads the newer release's installer into the Downloads folder and checks it against GitHub's checksum. */
  downloadUpdate(): Promise<DownloadState>
  /** Opens the downloaded installer and closes FraiTube on Windows; shows the AppImage in its folder on Linux. */
  installUpdate(): Promise<void>
  /** Calls the listener whenever an update check starts or ends. Returns a function that stops listening. */
  onUpdateStateChanged(listener: (state: UpdateState) => void): () => void
  /** Calls the listener as the installer download goes on. Returns a function that stops listening. */
  onUpdateDownloadChanged(listener: (download: DownloadState) => void): () => void
  /** The SponsorBlock segments of a video. Empty while SponsorBlock is off, and then nothing is requested. */
  getSponsorSegments(videoId: string): Promise<Segment[]>
  /** Calls the listener when a video went into the PiP window, so this window's video pauses. Returns a function that stops listening. */
  onPauseRequested(listener: () => void): () => void
  /**
   * Plays the video in the PiP window from the given second, replacing the video playing there,
   * with the given subtitle track on, or subtitles off when it is empty.
   */
  openPip(videoId: string, seconds: number, subtitles: string): void
  /** Closes the PiP window; its video saves where it stopped. */
  closePip(): void
  /**
   * From the PiP window: its video opens on the watch page of the app window it came from, and the
   * PiP window keeps playing until that page takes over. Its subtitle track, or empty for off, comes along.
   */
  pipBack(videoId: string, seconds: number, subtitles: string): void
  /** From the PiP window: moves it by the given number of pixels. */
  movePip(dx: number, dy: number): void
  /**
   * Calls the listener when the PiP window's video comes back to this window, with its subtitle
   * track, empty for off. Returns a function that stops listening.
   */
  onPipReturned(listener: (videoId: string, seconds: number, subtitles: string) => void): () => void
  /**
   * From a player that has loaded and buffered a video moving between this window and the PiP window:
   * stops the player still playing it and returns the exact second it reached and whether it was
   * paused, or undefined when no player hands over.
   */
  takeOverPlayback(): Promise<HandOver | undefined>
  /**
   * Calls the listener when another window's player takes over this window's video, or when the PiP
   * window closed before it took over. The listener stops the video and returns the second it reached
   * and whether it was paused, or undefined when it has none to hand over.
   * Returns a function that stops listening.
   */
  onHandOverRequested(listener: () => HandOver | undefined): () => void
  getSyncStatus(): Promise<SyncStatus>
  /** Syncs now, or waits for the sync already running, and returns the status after it. */
  syncNow(): Promise<SyncStatus>
  /** Asks for the sync folder and saves it. Undefined when no folder was chosen. */
  chooseSyncFolder(): Promise<string | undefined>
  /** Asks for the rclone executable and saves its path. Undefined when no file was chosen. */
  chooseRcloneProgram(): Promise<string | undefined>
  /** The remotes configured in rclone, or why they could not be listed. */
  listRcloneRemotes(): Promise<RcloneRemotes>
  /** Calls the listener whenever the sync status changes. Returns a function that stops listening. */
  onSyncStatusChanged(listener: (status: SyncStatus) => void): () => void
  /** True in the phone app. Absent on the desktop. */
  phone?: boolean
  /** Whether a WebDAV password is saved. Only the phone app syncs through WebDAV. */
  hasWebdavPassword?(): Promise<boolean>
  /** Saves the WebDAV password, which is kept on the phone and never handed back; an empty text removes it. */
  setWebdavPassword?(password: string): Promise<void>
  getBackupStatus(): Promise<BackupStatus>
  /** Asks where to save, then writes a backup there. */
  createBackup(): Promise<BackupStatus>
  /** Asks for a backup, confirms, restores it and restarts the app. */
  restoreBackup(): Promise<BackupStatus>
  /** Calls the listener whenever the backup status changes. Returns a function that stops listening. */
  onBackupStatusChanged(listener: (status: BackupStatus) => void): () => void
}

/** Longest in-app path accepted from a page. */
export const MAX_PATH_LENGTH = 2048

/** Returns true when the value is an in-app path the main process may load. */
export function isAppPath(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= MAX_PATH_LENGTH &&
    value.startsWith('/') &&
    !value.startsWith('//')
}

/** Returns true for https URLs on YouTube or its video servers, the only hosts pages may reach. */
export function isAllowedProxyUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    (url.hostname === 'www.youtube.com' || url.hostname.endsWith('.googlevideo.com'))
}

export function isProxyRequest(value: unknown): value is ProxyRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const request = value as Partial<ProxyRequest>
  return typeof request.url === 'string' &&
    isAllowedProxyUrl(request.url) &&
    (request.method === 'GET' || request.method === 'POST') &&
    typeof request.headers === 'object' && request.headers !== null &&
    Object.values(request.headers).every((header) => typeof header === 'string') &&
    (request.body === undefined || request.body instanceof Uint8Array)
}

/** Longest search query accepted from a page. */
export const MAX_QUERY_LENGTH = 200

const SEARCH_FILTERS = new Set(['all', 'videos', 'live', 'channels', 'shorts'])
const CHANNEL_TABS = new Set(['videos', 'shorts'])
const CONTINUATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isSearchRequest(value: unknown): value is SearchRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const request = value as Partial<SearchRequest>
  return typeof request.query === 'string' &&
    request.query.trim().length > 0 &&
    request.query.length <= MAX_QUERY_LENGTH &&
    typeof request.filter === 'string' && SEARCH_FILTERS.has(request.filter) &&
    (request.continuation === undefined || (typeof request.continuation === 'string' && CONTINUATION.test(request.continuation)))
}

/** A typed text to get search suggestions for: any text up to MAX_QUERY_LENGTH characters. */
export function isSuggestionText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_QUERY_LENGTH
}

/**
 * The channel ID is checked separately; a search query is not blank and not too long, the tab is
 * Videos or Shorts, and the continuation is an ID the main process handed out.
 */
export function isChannelVideosRequest(value: unknown): value is ChannelVideosRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const request = value as Partial<ChannelVideosRequest>
  return typeof request.channelId === 'string' &&
    (request.query === undefined || (typeof request.query === 'string' && request.query.trim().length > 0 && request.query.length <= MAX_QUERY_LENGTH)) &&
    (request.tab === undefined || (typeof request.tab === 'string' && CHANNEL_TABS.has(request.tab))) &&
    (request.continuation === undefined || (typeof request.continuation === 'string' && CONTINUATION.test(request.continuation)))
}

const COMMENT_SORTS = new Set(['top', 'newest'])

/** The video ID is checked separately; the continuation is an ID the main process handed out. */
export function isCommentsRequest(value: unknown): value is CommentsRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const request = value as Partial<CommentsRequest>
  return typeof request.videoId === 'string' &&
    typeof request.sort === 'string' && COMMENT_SORTS.has(request.sort) &&
    (request.continuation === undefined || (typeof request.continuation === 'string' && CONTINUATION.test(request.continuation)))
}

/** Longest caption track ID accepted from a page. */
export const MAX_TRACK_ID_LENGTH = 100

export function isTrackId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TRACK_ID_LENGTH
}

/** Longest SABR reload token accepted from a page. */
export const MAX_RELOAD_TOKEN_LENGTH = 4096

/** A reload token is optional; when given it is a non-empty string of bounded length. */
export function isReloadToken(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= MAX_RELOAD_TOKEN_LENGTH)
}
