import type { SettingValue } from '@fraitube/app-api/settings'
import { hashPrefix, isServerUrl, parseSegments, segmentsUrl, SKIPPABLE_CATEGORIES } from '@fraitube/sponsorblock'
import type { Category } from '@fraitube/sponsorblock/types'
import { openStorage, syncedTables, type ModuleSchema } from '@fraitube/storage'
import { isChannel, isChannelId, parseSubscriptionsFile } from '@fraitube/subscriptions'
import { createYoutube } from '@fraitube/youtube'
import { isVideoId } from '@fraitube/youtube/ids'
import { createIconFiller } from '../../shell/src/main/channelIcons'
import { createFavoritesStore, favoritesSchema } from '../../shell/src/main/favoritesStore'
import { createFeedService, readSavedFeed } from '../../shell/src/main/feed'
import { captionRequestHeaders, isCaptionUrl, isPageUrl, pageRequestHeaders } from '../../shell/src/main/headers'
import { historyFileFormat, NEWPIPE_HISTORY_SQL, NEWPIPE_YOUTUBE_SERVICE, newPipeEntries, parseFreeTubeHistory } from '../../shell/src/main/historyFiles'
import { createHistoryStore, historySchema } from '../../shell/src/main/historyStore'
import { createPlaybackCache } from '../../shell/src/main/playbackCache'
import { createSearchHistoryStore, searchHistorySchema } from '../../shell/src/main/searchHistoryStore'
import { createSettingsStore, settingsSchema } from '../../shell/src/main/settingsStore'
import { createSubscriptionsStore, subscriptionsSchema } from '../../shell/src/main/subscriptionsStore'
import {
  isAppPath,
  isChannelVideosRequest,
  isCommentsRequest,
  isProxyRequest,
  isReloadToken,
  isSearchRequest,
  isSuggestionText,
  isTrackId,
  type FeedProgress,
  type FraiTubeBridge
} from '../../shell/src/shared/bridge'
import { isHistorySeconds, isHistoryVideo } from '../../shell/src/shared/history'
import { isSearchQuery, SearchHistorySettingKey, searchesKept } from '../../shell/src/shared/searchHistory'
import { allSettingDefinitions, feedMaxAgeMs, SettingKey, shortsShown } from '../../shell/src/shared/settings'
import { categoryModes, SponsorBlockSettingKey } from '../../shell/src/shared/sponsorBlockSettings'
import { CHANGED_SYNC_PLACE, MAX_WEBDAV_TEXT_LENGTH, SyncSettingKey, type SyncStatus } from '../../shell/src/shared/syncSettings'
import type { DownloadState, UpdateState } from '../../shell/src/shared/updates'
import { syncSchema } from '../../sync/src/engine'
import type { BackupStatus } from '../../shell/src/shared/backupSettings'
import { PlayerSettingKey } from '../../shell/src/shared/playerSettings'
import { noteVideoTitle } from './android'
import { createBackupService } from './backup'
import { awaitPicker, pickerOpen, runHidden } from './hiddenCalls'
import { createNativeFetch } from './native'
import { createSyncService } from './sync'

/** Tables of every module the Android app has, as numbered upgrade steps. */
const schemas: ModuleSchema[] = [settingsSchema, subscriptionsSchema, historySchema, favoritesSchema, searchHistorySchema, syncSchema]

/** Longest time one SponsorBlock request may take. */
const SPONSOR_TIMEOUT_MS = 10_000

/** A listener registration that never calls back, for events the Android app does not send. */
function never(): () => void {
  return () => undefined
}

function refuse(): never {
  throw new Error('Request refused')
}

/** The listeners of one event, and a way to call them all. */
function createEvent<Arguments extends unknown[]>(): { listen(listener: (...values: Arguments) => void): () => void; announce(...values: Arguments): void } {
  const listeners = new Set<(...values: Arguments) => void>()
  return {
    listen(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    announce(...values) {
      for (const listener of listeners) {
        listener(...values)
      }
    }
  }
}

/**
 * The bridge the screens talk to, for the Android app. Search, videos, settings, subscriptions, New
 * videos, history, favorites, past searches and SponsorBlock work as on the desktop, with the same
 * code over the phone's database. What the Android app does not have answers as empty.
 */
export function createBridge(): FraiTubeBridge {
  const native = window.FraiTubeNative
  const userAgent = native.userAgent()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // YouTube requests carry the same headers as on the desktop.
  const youtubeFetch = createNativeFetch(native, '/_net/', (url, headers) => {
    if (isPageUrl(url)) {
      return pageRequestHeaders(headers, timeZone)
    }
    return isCaptionUrl(url) ? captionRequestHeaders(headers) : headers
  })

  const youtube = createYoutube({
    userAgent,
    fetch: youtubeFetch,
    mintPoToken: (request) => runHidden('token', JSON.stringify(request))
  })
  const playbacks = createPlaybackCache((videoId, onDetails) => youtube.getPlayback(videoId, onDetails))
  youtube.startSession()

  // SponsorBlock's server is reached through a route of its own, which only lists segments.
  const sponsorFetch = createNativeFetch({ request: (details, body) => native.sponsorRequest(details, body) }, '/_sb/')

  const storage = openStorage('fraitube.db', schemas)
  const settings = createSettingsStore(storage, allSettingDefinitions())
  const subscriptions = createSubscriptionsStore(storage)
  const history = createHistoryStore(storage)
  const favorites = createFavoritesStore(storage)
  const searches = createSearchHistoryStore(storage)

  const settingChanged = createEvent<[key: string, value: SettingValue]>()
  const subscriptionsChanged = createEvent<[]>()
  const historyChanged = createEvent<[]>()
  const historyPositionSaved = createEvent<[videoId: string, positionSeconds: number]>()
  const favoritesChanged = createEvent<[]>()
  const searchHistoryChanged = createEvent<[]>()
  const feedProgress = createEvent<[progress: FeedProgress]>()

  // The fetched feed is kept between starts in a file the Android side holds.
  const feed = createFeedService(
    async (url) => {
      const response = await youtubeFetch(url)
      return { status: response.status, text: response.status === 200 ? await response.text() : '' }
    },
    Date.now,
    feedProgress.announce,
    {
      load: () => readSavedFeed(native.readFeed()),
      save: (saved) => native.writeFeed(JSON.stringify(saved))
    },
    () => feedMaxAgeMs(settings.get(SettingKey.feedRefresh)),
    () => shortsShown(settings.get(SettingKey.showShorts))
  )

  const icons = createIconFiller({
    missing: () => subscriptions.missingAvatars(),
    fetchIcon: (channelId) => youtube.getChannelIcon(channelId),
    save: (channelId, avatar) => subscriptions.setAvatar(channelId, avatar),
    announce: subscriptionsChanged.announce
  })
  const fillIcons = (): void => {
    void icons.fill()
  }
  fillIcons()

  const searchesToKeep = (): number => searchesKept(settings.get(SearchHistorySettingKey.kept))

  /**
   * Asks for a file to import with Android's file picker. Gives its name and contents, or undefined
   * when none was chosen. A NewPipe history backup's contents are the rows the statement finds in it.
   */
  async function chooseFile(kind: 'subscriptions' | 'history' | 'backup', sql = '', values: unknown[] = []): Promise<{ name: string; contents: Response } | undefined> {
    const answer = await awaitPicker((callId) => native.chooseFile(callId, kind, sql, JSON.stringify(values)))
    if (!answer) {
      return undefined
    }
    const { name, id } = JSON.parse(answer) as { name: string; id: string }
    const response = await fetch(`/_file/${id}`)
    if (!response.ok) {
      throw new Error('The file could not be read')
    }
    return { name, contents: response }
  }

  const backupStatusChanged = createEvent<[status: BackupStatus]>()
  const backup = createBackupService({ native, storage, schemas, chooseFile, announce: backupStatusChanged.announce })

  const updateState: UpdateState = { status: 'idle', currentVersion: native.version() }
  const downloadState: DownloadState = { status: 'idle', received: 0, total: 0, action: 'show' }

  const syncStatusChanged = createEvent<[status: SyncStatus]>()
  const sync = createSyncService({
    native,
    storage,
    settings,
    tables: syncedTables(schemas),
    pickerOpen,
    announceStatus: syncStatusChanged.announce,
    announceChanges(changedKeys) {
      for (const key of changedKeys['settings'] ?? []) {
        // The setting about a second window stays off on a phone, whatever value syncs in.
        if (key === PlayerSettingKey.pipOnLeave) {
          continue
        }
        try {
          settingChanged.announce(key, settings.get(key))
        } catch {
          // A setting of a module this app does not have.
        }
      }
      if (changedKeys['subscriptions']) {
        feed.keepOnly(subscriptions.list())
        subscriptionsChanged.announce()
        fillIcons()
      }
      if (changedKeys['history']) {
        historyChanged.announce()
      }
      if (changedKeys['favorites']) {
        favoritesChanged.announce()
      }
      if (changedKeys['search_history']) {
        searchHistoryChanged.announce()
      }
    }
  })
  sync.start()

  return {
    phone: true,
    openWindow(path) {
      // The phone has one window, so the path opens in it.
      if (isAppPath(path)) {
        window.location.hash = path
      }
    },
    async fetch(request) {
      if (!isProxyRequest(request)) {
        refuse()
      }
      const response = await youtubeFetch(request.url, { method: request.method, headers: request.headers, body: request.body })
      return {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
        body: new Uint8Array(await response.arrayBuffer())
      }
    },
    async getPlayback(videoId, fresh) {
      const playback = await (isVideoId(videoId) ? playbacks.get(videoId, fresh === true) : refuse())
      noteVideoTitle(playback.title)
      return playback
    },
    async getVideoDetails(videoId) {
      const found = await (isVideoId(videoId) ? playbacks.details(videoId) : refuse())
      noteVideoTitle(found.title)
      return found
    },
    refreshPoToken: async (videoId) => isVideoId(videoId) ? youtube.refreshPoToken(videoId) : refuse(),
    // Moving a video to a second window on leaving its page does not exist on a phone, so that
    // setting always reads as off here, whatever the synced value is.
    getSettings: async () => ({ ...settings.getAll(), [PlayerSettingKey.pipOnLeave]: false }),
    async setSetting(key, value) {
      if (typeof key !== 'string') {
        refuse()
      }
      if (key === PlayerSettingKey.pipOnLeave) {
        return
      }
      settingChanged.announce(key, settings.set(key, value))
    },
    onSettingChanged: settingChanged.listen,
    search: async (request) => isSearchRequest(request)
      ? youtube.search({ query: request.query.trim(), filter: request.filter, continuation: request.continuation })
      : refuse(),
    getChannelVideos: async (request) => isChannelVideosRequest(request) && isChannelId(request.channelId)
      ? youtube.getChannelVideos({ channelId: request.channelId, query: request.query?.trim(), tab: request.tab, continuation: request.continuation })
      : refuse(),
    getSearchSuggestions: async (text) => isSuggestionText(text) ? youtube.getSearchSuggestions(text) : refuse(),
    getCaptions: async (videoId, trackId) => isVideoId(videoId) && isTrackId(trackId) ? youtube.getCaptions(videoId, trackId) : refuse(),
    getComments: async (request) => isCommentsRequest(request) && isVideoId(request.videoId)
      ? youtube.getComments({ videoId: request.videoId, sort: request.sort, continuation: request.continuation })
      : refuse(),
    reloadStreaming: async (videoId, reloadToken) => isVideoId(videoId) && isReloadToken(reloadToken)
      ? youtube.reloadStreaming(videoId, reloadToken)
      : refuse(),
    listSubscriptions: async () => subscriptions.list(),
    async subscribe(channel) {
      if (!isChannel(channel)) {
        refuse()
      }
      subscriptions.subscribe({ id: channel.id, name: channel.name, avatar: channel.avatar })
      subscriptionsChanged.announce()
      fillIcons()
    },
    async unsubscribe(channelId) {
      if (!isChannelId(channelId)) {
        refuse()
      }
      subscriptions.unsubscribe(channelId)
      feed.keepOnly(subscriptions.list())
      subscriptionsChanged.announce()
    },
    async clearSubscriptions() {
      subscriptions.clear()
      feed.keepOnly(subscriptions.list())
      subscriptionsChanged.announce()
    },
    async importSubscriptions() {
      const file = await chooseFile('subscriptions')
      if (!file) {
        return undefined
      }
      const { format, channels } = parseSubscriptionsFile(file.name, await file.contents.text())
      const summary = subscriptions.import(channels, format)
      subscriptionsChanged.announce()
      fillIcons()
      return summary
    },
    getFeed: async (refresh) => typeof refresh === 'boolean' ? feed.get(subscriptions.list(), refresh) : refuse(),
    onFeedProgress: feedProgress.listen,
    onSubscriptionsChanged: subscriptionsChanged.listen,
    listHistory: async () => history.list(),
    async recordHistory(video) {
      if (!isHistoryVideo(video)) {
        refuse()
      }
      const entry = history.record(video)
      historyChanged.announce()
      return entry
    },
    saveHistoryPosition(videoId, positionSeconds) {
      if (isVideoId(videoId) && isHistorySeconds(positionSeconds) && history.savePosition(videoId, positionSeconds)) {
        historyPositionSaved.announce(videoId, positionSeconds)
      }
    },
    async removeHistory(videoId) {
      if (!isVideoId(videoId)) {
        refuse()
      }
      history.remove(videoId)
      historyChanged.announce()
    },
    async markWatched(video) {
      if (!isHistoryVideo(video)) {
        refuse()
      }
      history.markWatched(video)
      historyChanged.announce()
    },
    async markUnwatched(videoId) {
      if (!isVideoId(videoId)) {
        refuse()
      }
      history.markUnwatched(videoId)
      historyChanged.announce()
    },
    async clearHistory() {
      history.clear()
      historyChanged.announce()
    },
    async importHistory() {
      const file = await chooseFile('history', NEWPIPE_HISTORY_SQL, [NEWPIPE_YOUTUBE_SERVICE])
      if (!file) {
        return undefined
      }
      const format = historyFileFormat(file.name)
      const contents = await file.contents.text()
      const entries = format === 'freetube'
        ? parseFreeTubeHistory(contents)
        : newPipeEntries(JSON.parse(contents) as Record<string, unknown>[])
      const summary = history.import(entries, format)
      historyChanged.announce()
      return summary
    },
    onHistoryChanged: historyChanged.listen,
    onHistoryPositionSaved: historyPositionSaved.listen,
    listFavorites: async () => favorites.list(),
    async addFavorite(video) {
      if (!isHistoryVideo(video)) {
        refuse()
      }
      favorites.add(video)
      favoritesChanged.announce()
    },
    async removeFavorite(videoId) {
      if (!isVideoId(videoId)) {
        refuse()
      }
      favorites.remove(videoId)
      favoritesChanged.announce()
    },
    onFavoritesChanged: favoritesChanged.listen,
    listSearchHistory: async () => searches.list(searchesToKeep()),
    async addSearch(query) {
      if (!isSearchQuery(query)) {
        refuse()
      }
      // Searches are saved only while Remember searches is on.
      if (settings.get(SearchHistorySettingKey.remember) !== false) {
        searches.add(query, searchesToKeep())
        searchHistoryChanged.announce()
      }
    },
    async removeSearch(query) {
      if (!isSearchQuery(query)) {
        refuse()
      }
      searches.remove(query)
      searchHistoryChanged.announce()
    },
    async clearSearchHistory() {
      searches.clear()
      searchHistoryChanged.announce()
    },
    onSearchHistoryChanged: searchHistoryChanged.listen,
    getAppInfo: async () => ({ version: native.version(), dataFolder: '' }),
    openDataFolder: () => undefined,
    getUpdateState: async () => ({ state: updateState, download: downloadState }),
    checkForUpdates: async () => updateState,
    downloadUpdate: async () => downloadState,
    installUpdate: async () => undefined,
    onUpdateStateChanged: never,
    onUpdateDownloadChanged: never,
    async getSponsorSegments(videoId) {
      if (!isVideoId(videoId)) {
        refuse()
      }
      // Nothing is sent while SponsorBlock is off.
      if (settings.get(SponsorBlockSettingKey.enabled) !== true) {
        return []
      }
      const server = settings.get(SponsorBlockSettingKey.server)
      if (!isServerUrl(server)) {
        throw new Error('The SponsorBlock server address must be an https address')
      }
      const modes = categoryModes((key) => settings.get(key))
      const categories: Category[] = SKIPPABLE_CATEGORIES.map((category) => category.id).filter((id) => modes[id] !== 'off')
      categories.push('poi_highlight')

      const response = await sponsorFetch(segmentsUrl(server, await hashPrefix(videoId), categories), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(SPONSOR_TIMEOUT_MS)
      })
      // The server answers 404 when no video with this hash prefix has segments.
      if (response.status === 404) {
        return []
      }
      if (!response.ok) {
        throw new Error(`SponsorBlock request failed with status ${response.status}`)
      }
      return parseSegments(await response.json(), videoId)
    },
    onPauseRequested: never,
    openPip: () => native.enterPictureInPicture(),
    closePip: () => undefined,
    pipBack: () => undefined,
    movePip: () => undefined,
    onPipReturned: never,
    takeOverPlayback: async () => undefined,
    onHandOverRequested: never,
    getSyncStatus: async () => sync.status(),
    syncNow: () => sync.run(),
    async chooseSyncFolder() {
      const name = await awaitPicker((callId) => native.chooseSyncFolder(callId))
      if (!name) {
        return undefined
      }
      settingChanged.announce(SyncSettingKey.folder, settings.set(SyncSettingKey.folder, name))
      // Two folders can share a name, so a newly picked folder always counts as a changed sync place.
      if (settings.get(SyncSettingKey.place) !== '') {
        settings.set(SyncSettingKey.place, CHANGED_SYNC_PLACE)
      }
      return name
    },
    // rclone exists only on the desktop.
    chooseRcloneProgram: async () => undefined,
    listRcloneRemotes: async () => ({ remotes: [] }),
    onSyncStatusChanged: syncStatusChanged.listen,
    hasWebdavPassword: async () => native.hasSyncPassword(String(settings.get(SyncSettingKey.webdavAddress))),
    async setWebdavPassword(password) {
      if (typeof password !== 'string' || password.length > MAX_WEBDAV_TEXT_LENGTH) {
        refuse()
      }
      // The password is saved for the address set now; a later change of address needs it again.
      const failure = native.setSyncPassword(String(settings.get(SyncSettingKey.webdavAddress)), password)
      if (failure) {
        throw new Error(failure)
      }
    },
    getBackupStatus: async () => backup.status(),
    createBackup: () => backup.create(),
    restoreBackup: () => backup.restore(),
    onBackupStatusChanged: backupStatusChanged.listen
  }
}
