import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { SettingValue } from '@fraitube/app-api/settings'
import { IpcChannel, type FeedProgress, type FraiTubeBridge } from '../shared/bridge'
import type { BackupStatus } from '../shared/backupSettings'
import type { SyncStatus } from '../shared/syncSettings'

const bridge: FraiTubeBridge = {
  openWindow(path) {
    ipcRenderer.send(IpcChannel.openWindow, path)
  },
  fetch(request) {
    return ipcRenderer.invoke(IpcChannel.fetch, request)
  },
  getPlayback(videoId, fresh) {
    return ipcRenderer.invoke(IpcChannel.playback, videoId, fresh)
  },
  getVideoDetails(videoId) {
    return ipcRenderer.invoke(IpcChannel.videoDetails, videoId)
  },
  refreshPoToken(videoId) {
    return ipcRenderer.invoke(IpcChannel.refreshPoToken, videoId)
  },
  search(request) {
    return ipcRenderer.invoke(IpcChannel.search, request)
  },
  getCaptions(videoId, trackId) {
    return ipcRenderer.invoke(IpcChannel.captions, videoId, trackId)
  },
  getComments(request) {
    return ipcRenderer.invoke(IpcChannel.comments, request)
  },
  reloadStreaming(videoId, reloadToken) {
    return ipcRenderer.invoke(IpcChannel.reloadStreaming, videoId, reloadToken)
  },
  getSettings() {
    return ipcRenderer.invoke(IpcChannel.getSettings)
  },
  setSetting(key, value) {
    return ipcRenderer.invoke(IpcChannel.setSetting, key, value)
  },
  onSettingChanged(listener) {
    const handler = (_event: IpcRendererEvent, key: string, value: SettingValue): void => listener(key, value)
    ipcRenderer.on(IpcChannel.settingChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.settingChanged, handler)
    }
  },
  listSubscriptions() {
    return ipcRenderer.invoke(IpcChannel.listSubscriptions)
  },
  subscribe(channel) {
    return ipcRenderer.invoke(IpcChannel.subscribe, channel)
  },
  unsubscribe(channelId) {
    return ipcRenderer.invoke(IpcChannel.unsubscribe, channelId)
  },
  clearSubscriptions() {
    return ipcRenderer.invoke(IpcChannel.clearSubscriptions)
  },
  importSubscriptions() {
    return ipcRenderer.invoke(IpcChannel.importSubscriptions)
  },
  getFeed(refresh) {
    return ipcRenderer.invoke(IpcChannel.feed, refresh)
  },
  onFeedProgress(listener) {
    const handler = (_event: IpcRendererEvent, progress: FeedProgress): void => listener(progress)
    ipcRenderer.on(IpcChannel.feedProgress, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.feedProgress, handler)
    }
  },
  onSubscriptionsChanged(listener) {
    const handler = (): void => listener()
    ipcRenderer.on(IpcChannel.subscriptionsChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.subscriptionsChanged, handler)
    }
  },
  listHistory() {
    return ipcRenderer.invoke(IpcChannel.listHistory)
  },
  recordHistory(video) {
    return ipcRenderer.invoke(IpcChannel.recordHistory, video)
  },
  saveHistoryPosition(videoId, positionSeconds) {
    ipcRenderer.send(IpcChannel.saveHistoryPosition, videoId, positionSeconds)
  },
  removeHistory(videoId) {
    return ipcRenderer.invoke(IpcChannel.removeHistory, videoId)
  },
  markWatched(video) {
    return ipcRenderer.invoke(IpcChannel.markWatched, video)
  },
  markUnwatched(videoId) {
    return ipcRenderer.invoke(IpcChannel.markUnwatched, videoId)
  },
  clearHistory() {
    return ipcRenderer.invoke(IpcChannel.clearHistory)
  },
  importHistory() {
    return ipcRenderer.invoke(IpcChannel.importHistory)
  },
  onHistoryChanged(listener) {
    const handler = (): void => listener()
    ipcRenderer.on(IpcChannel.historyChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.historyChanged, handler)
    }
  },
  onHistoryPositionSaved(listener) {
    const handler = (_event: IpcRendererEvent, videoId: string, positionSeconds: number): void => listener(videoId, positionSeconds)
    ipcRenderer.on(IpcChannel.historyPositionSaved, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.historyPositionSaved, handler)
    }
  },
  getSponsorSegments(videoId) {
    return ipcRenderer.invoke(IpcChannel.sponsorSegments, videoId)
  },
  onPauseRequested(listener) {
    const handler = (): void => listener()
    ipcRenderer.on(IpcChannel.pausePlayback, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.pausePlayback, handler)
    }
  },
  openPip(videoId, seconds, subtitles) {
    ipcRenderer.send(IpcChannel.openPip, videoId, seconds, subtitles)
  },
  closePip() {
    ipcRenderer.send(IpcChannel.closePip)
  },
  pipBack(videoId, seconds, subtitles) {
    ipcRenderer.send(IpcChannel.pipBack, videoId, seconds, subtitles)
  },
  movePip(dx, dy) {
    ipcRenderer.send(IpcChannel.movePip, dx, dy)
  },
  onPipReturned(listener) {
    const handler = (_event: IpcRendererEvent, videoId: string, seconds: number, subtitles: string): void => listener(videoId, seconds, subtitles)
    ipcRenderer.on(IpcChannel.pipReturned, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.pipReturned, handler)
    }
  },
  takeOverPlayback() {
    return ipcRenderer.invoke(IpcChannel.takeOverPlayback)
  },
  onHandOverRequested(listener) {
    const handler = (_event: IpcRendererEvent, requestId: number): void => {
      ipcRenderer.send(IpcChannel.handedOver, requestId, listener())
    }
    ipcRenderer.on(IpcChannel.handOverRequested, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.handOverRequested, handler)
    }
  },
  getSyncStatus() {
    return ipcRenderer.invoke(IpcChannel.syncStatus)
  },
  syncNow() {
    return ipcRenderer.invoke(IpcChannel.syncNow)
  },
  chooseSyncFolder() {
    return ipcRenderer.invoke(IpcChannel.chooseSyncFolder)
  },
  chooseRcloneProgram() {
    return ipcRenderer.invoke(IpcChannel.chooseRcloneProgram)
  },
  listRcloneRemotes() {
    return ipcRenderer.invoke(IpcChannel.rcloneRemotes)
  },
  onSyncStatusChanged(listener) {
    const handler = (_event: IpcRendererEvent, status: SyncStatus): void => listener(status)
    ipcRenderer.on(IpcChannel.syncStatusChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.syncStatusChanged, handler)
    }
  },
  getBackupStatus() {
    return ipcRenderer.invoke(IpcChannel.backupStatus)
  },
  createBackup() {
    return ipcRenderer.invoke(IpcChannel.createBackup)
  },
  restoreBackup() {
    return ipcRenderer.invoke(IpcChannel.restoreBackup)
  },
  onBackupStatusChanged(listener) {
    const handler = (_event: IpcRendererEvent, status: BackupStatus): void => listener(status)
    ipcRenderer.on(IpcChannel.backupStatusChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.backupStatusChanged, handler)
    }
  }
}

contextBridge.exposeInMainWorld('fraitube', bridge)
