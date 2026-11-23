<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import {
  activeCueText,
  attachPlayer,
  chapterAt,
  chapterBreaks,
  getVolumeControl,
  MAX_VOLUME,
  newestRows,
  pickCaptionTrack,
  previewPictureStyle,
  RECONNECT_CALM_MS,
  reconnectWaitMs,
  rollCues,
  shownVideoRect,
  subtitleLayout,
  type Cue,
  type PlayerHandle,
  type PlayerSource,
  type VolumeControl
} from '@fraitube/player'
import {
  listFormats,
  listQualities,
  openStream,
  pickAudioFormat,
  pickVideoFormat,
  qualityHeight,
  type Quality,
  type SabrFormat,
  type SabrInput
} from '@fraitube/sabr'
import { categoryColor, categoryNoun, isMutedAt, segmentToSkip, visibleSegments } from '@fraitube/sponsorblock'
import type { Segment } from '@fraitube/sponsorblock/types'
import { normalizeAvatar } from '@fraitube/subscriptions'
import type { VideoPlayback } from '@fraitube/youtube/types'
import {
  HistorySettingKey,
  MAX_HISTORY_CHANNEL_NAME_LENGTH,
  MAX_HISTORY_TITLE_LENGTH,
  positionToSave,
  resumeSeconds
} from '../../../shared/history'
import { PlayerSettingKey, SUBTITLE_DEFAULTS } from '../../../shared/playerSettings'
import { categoryModes, SponsorBlockSettingKey } from '../../../shared/sponsorBlockSettings'
import { bridgeFetch } from '../../net'
import { bufferedForHandOver, HAND_OVER_WAIT_MS } from './handOver'
import { startingSubtitleTrack } from './subtitleStart'
import { setSetting, settings } from '../../settings'
import { playerStatusText } from './playerStatus'

/**
 * `compact` is the PiP window's player: a smaller control bar and no keyboard shortcuts.
 * `startSeconds` starts the video there instead of at its saved position.
 */
const props = defineProps<{
  playback: VideoPlayback
  compact?: boolean
  startSeconds?: number
  offPage?: boolean
  waitForHandOver?: boolean
  startSubtitles?: string
}>()
/**
 * `pip`: the PiP button was pressed, after leaving full screen. `offPage` means the player is kept
 * out of sight, playing on until the PiP window takes over.
 * `waitForHandOver` loads the video paused at its start and buffers it; `readyToTakeOver` then
 * says it can carry on from the other player, which `takeOver` does.
 * `startSubtitles` is the subtitle track a moved video brings, empty for off.
 */
const emit = defineEmits<{ pip: []; readyToTakeOver: [] }>()

/** Auto quality never goes below this height, even in a small window. */
const MIN_AUTO_HEIGHT = 360
const HIDE_CONTROLS_MS = 3000
const AUTO_QUALITY_DELAY_MS = 1000
const SAVE_VOLUME_DELAY_MS = 500
const SEEK_STEP_SECONDS = 5
const JUMP_STEP_SECONDS = 10
const VOLUME_STEP = 5
/** How often the position of a playing video is saved. */
const SAVE_POSITION_MS = 5000
/** How long the "Skipped" notice with its Undo button stays. */
const SKIP_NOTICE_MS = 6000
/** Width of the preview picture shown over the seek bar, in pixels. */
const PREVIEW_WIDTH = 176

const box = useTemplateRef<HTMLDivElement>('box')
const videoElement = useTemplateRef<HTMLVideoElement>('video')
const seekBar = useTemplateRef<HTMLDivElement>('seekBar')

const error = ref('')
const paused = ref(true)
const buffering = ref(false)
const reloading = ref(false)
/** True while a stopped video reconnects. */
const reconnecting = ref(false)
/** The quality being switched to, while a quality switch runs. */
const switchingTo = ref('')
/** Where the video starts, until its first picture shows. */
const startingAt = ref<number>()
const status = computed(() => playerStatusText({
  reconnecting: reconnecting.value,
  switchingTo: switchingTo.value,
  startingAt: startingAt.value,
  buffering: buffering.value || reloading.value
}))
const currentTime = ref(0)
const bufferedEnd = ref(0)
const seekPreview = ref<number>()
/** The time under the mouse while it is over the seek bar. */
const hoverTime = ref<number>()
const seekBarWidth = ref(0)
const volume = ref(savedVolume())
const muted = ref(false)
const fullscreen = ref(false)
const controlsShown = ref(true)
const qualities = ref<Quality[]>([])
/** 'auto' or the height of a chosen quality. */
const qualityChoice = ref<'auto' | number>('auto')
const playingHeight = ref(0)
const subtitleTrack = ref('')
const cues = ref<Cue[]>([])
const subtitleText = ref('')
/** Shown above the control bar when a subtitle track could not be loaded. */
const subtitleError = ref('')
/** Shown above the control bar when SponsorBlock segments could not be loaded. */
const segmentsError = ref('')
const segments = ref<Segment[]>([])
/** The segment skipped last, while its notice shows. */
const skippedSegment = ref<Segment>()
/** True while a mute segment plays. */
const segmentMuted = ref(false)
const boxSize = ref({ width: 0, height: 0 })
const videoSize = ref({ width: 0, height: 0 })

let player: PlayerHandle | undefined
let volumeControl: VolumeControl | undefined
let input: SabrInput | undefined
let formats: SabrFormat[] = []
let audioFormat: SabrFormat | undefined
let loadId = 0
let recovering = false
/** True while a quality switch or recovery holds the video paused and plays it again afterwards. */
let resumeAfterReload = false
/** Tries to reconnect made since the last calm minute, which set the wait before the next try. */
let reconnectAttempt = 0
/** When the video last stopped or failed to reconnect. */
let lastTroubleAt = 0
let hideTimer: ReturnType<typeof setTimeout> | undefined
let autoTimer: ReturnType<typeof setTimeout> | undefined
let volumeTimer: ReturnType<typeof setTimeout> | undefined
let frame = 0
let resizeObserver: ResizeObserver | undefined
let positionTimer: ReturnType<typeof setInterval> | undefined
/** The video whose position is saved. Set once it plays, so a video still starting never overwrites its saved place. */
let trackedVideoId: string | undefined
let skipNoticeTimer: ReturnType<typeof setTimeout> | undefined
/** Segments the user undid, which are not skipped again in this video. */
let undoneSegments = new Set<string>()
const cueCache = new Map<string, Cue[]>()
/** True while the subtitles showing are auto-generated. */
let autoSubtitles = false

const duration = computed(() => props.playback.durationSeconds)
const shownTime = computed(() => seekPreview.value ?? currentTime.value)
const playedPercent = computed(() => (duration.value > 0 ? (shownTime.value / duration.value) * 100 : 0))
const bufferedPercent = computed(() => (duration.value > 0 ? Math.min(100, (bufferedEnd.value / duration.value) * 100) : 0))
const qualityLabel = computed(() => qualities.value.find((quality) => quality.height === playingHeight.value)?.label ?? '')
const segmentModes = computed(() => categoryModes((key) => settings[key]))
/** The segments drawn on the seek bar, in percent of the video. */
const segmentMarks = computed(() => {
  const length = duration.value
  if (length <= 0) {
    return []
  }
  return visibleSegments(segments.value, segmentModes.value).map((segment) => ({
    key: segment.uuid,
    left: (segment.start / length) * 100,
    width: ((segment.end - segment.start) / length) * 100,
    color: categoryColor(segment.category),
    point: segment.actionType === 'poi'
  }))
})

/** Where each chapter after the first starts, in percent of the video. */
const chapterGaps = computed(() => chapterBreaks(props.playback.chapters, duration.value))
const currentChapter = computed(() => chapterAt(props.playback.chapters, shownTime.value))

/** The preview over the seek bar: the picture, time and chapter for the hovered or dragged time. */
const preview = computed(() => {
  const time = seekPreview.value ?? hoverTime.value
  const width = seekBarWidth.value
  if (time === undefined || duration.value <= 0 || width <= 0) {
    return undefined
  }
  const sheets = props.playback.storyboard
  let picture: Record<string, string> | undefined
  let boxWidth = 0
  if (sheets) {
    boxWidth = PREVIEW_WIDTH
    picture = previewPictureStyle(sheets, time, PREVIEW_WIDTH)
  }
  const half = boxWidth / 2
  const x = (time / duration.value) * width
  return {
    left: `${Math.min(Math.max(x, half), Math.max(half, width - half))}px`,
    picture,
    time: formatTime(time),
    chapter: chapterAt(props.playback.chapters, time)?.title ?? ''
  }
})

function onSeekHover(event: MouseEvent): void {
  const rect = seekBar.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) {
    return
  }
  seekBarWidth.value = rect.width
  hoverTime.value = (Math.min(Math.max(event.clientX - rect.left, 0), rect.width) / rect.width) * duration.value
}

function onSeekLeave(): void {
  hoverTime.value = undefined
}

/** Subtitles cover the shown picture, placed and styled as chosen in Settings. */
const subtitleLook = computed(() => {
  const rect = shownVideoRect(boxSize.value.width, boxSize.value.height, videoSize.value.width, videoSize.value.height)
  const layout = subtitleLayout({
    positionPercent: numberSetting(PlayerSettingKey.subtitlePosition, SUBTITLE_DEFAULTS.position),
    font: textSetting(PlayerSettingKey.subtitleFont, SUBTITLE_DEFAULTS.font),
    sizePercent: numberSetting(PlayerSettingKey.subtitleSize, SUBTITLE_DEFAULTS.size),
    color: textSetting(PlayerSettingKey.subtitleColor, SUBTITLE_DEFAULTS.color),
    background: textSetting(PlayerSettingKey.subtitleBackground, SUBTITLE_DEFAULTS.background),
    backgroundOpacity: numberSetting(PlayerSettingKey.subtitleBackgroundOpacity, SUBTITLE_DEFAULTS.backgroundOpacity)
  }, rect.height)
  return {
    box: {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      paddingBlockEnd: `${layout.gapPx}px`,
      fontSize: `${layout.fontPx}px`,
      fontFamily: layout.fontFamily
    },
    cue: {
      color: layout.color,
      background: layout.background
    }
  }
})

function numberSetting(key: string, fallback: number): number {
  const value = settings[key]
  return typeof value === 'number' ? value : fallback
}

function textSetting(key: string, fallback: string): string {
  const value = settings[key]
  return typeof value === 'string' ? value : fallback
}

function savedVolume(): number {
  return numberSetting(PlayerSettingKey.volume, 100)
}

function defaultQualityHeight(): number {
  const value = Number(settings[PlayerSettingKey.defaultQuality])
  return Number.isFinite(value) && value > 0 ? value : 1080
}

function isSupported(mimeType: string): boolean {
  return MediaSource.isTypeSupported(mimeType)
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

function reportError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

function resumeEnabled(): boolean {
  return settings[HistorySettingKey.resume] !== false
}

/** Saves the exact position of the tracked video, or its full length when it has played to its end. */
function savePosition(): void {
  const element = videoElement.value
  if (!trackedVideoId || !element || !resumeEnabled()) {
    return
  }
  window.fraitube.saveHistoryPosition(trackedVideoId, positionToSave(element.currentTime, element.ended, element.duration))
}

function onPlaying(): void {
  buffering.value = false
  trackedVideoId = props.playback.videoId
}

async function loadSegments(videoId: string, id: number): Promise<void> {
  try {
    const found = await window.fraitube.getSponsorSegments(videoId)
    if (id === loadId) {
      segments.value = found
    }
  } catch {
    if (id === loadId) {
      segmentsError.value = 'SponsorBlock segments could not be loaded'
    }
  }
}

function showSkipNotice(segment: Segment): void {
  skippedSegment.value = segment
  clearTimeout(skipNoticeTimer)
  skipNoticeTimer = setTimeout(() => {
    skippedSegment.value = undefined
  }, SKIP_NOTICE_MS)
}

/** Goes back to the start of the skipped segment, which then plays. */
function undoSkip(): void {
  const segment = skippedSegment.value
  if (!segment) return
  undoneSegments.add(segment.uuid)
  skippedSegment.value = undefined
  clearTimeout(skipNoticeTimer)
  seekTo(segment.start)
}

/** Skips a Skip segment the playhead entered, to exactly its end, and mutes during mute segments. */
function applySegments(element: HTMLVideoElement): void {
  if (!element.paused && !element.seeking && !reloading.value) {
    const segment = segmentToSkip(segments.value, element.currentTime, segmentModes.value, undoneSegments)
    if (segment) {
      element.currentTime = segment.end
      showSkipNotice(segment)
    }
  }
  const mute = isMutedAt(segments.value, element.currentTime, segmentModes.value)
  if (mute !== segmentMuted.value) {
    segmentMuted.value = mute
  }
}

/** Records the video in the history and returns where it starts. */
async function startPosition(playback: VideoPlayback): Promise<number> {
  try {
    const entry = await window.fraitube.recordHistory({
      videoId: playback.videoId,
      title: playback.title.slice(0, MAX_HISTORY_TITLE_LENGTH),
      channelId: playback.channelId,
      channelName: playback.author.slice(0, MAX_HISTORY_CHANNEL_NAME_LENGTH),
      channelAvatar: normalizeAvatar(playback.about.channelIcon),
      durationSeconds: playback.durationSeconds
    })
    return resumeEnabled() ? resumeSeconds(entry.positionSeconds, playback.durationSeconds) : 0
  } catch {
    return 0
  }
}

/** The height auto quality aims for: the player's height in screen pixels, at least 360p, at most the default quality. */
function autoHeight(): number {
  const screenHeight = (box.value?.clientHeight ?? 0) * window.devicePixelRatio
  return Math.min(defaultQualityHeight(), Math.max(MIN_AUTO_HEIGHT, screenHeight))
}

function wantedVideoFormat(): SabrFormat | undefined {
  const maxHeight = qualityChoice.value === 'auto' ? autoHeight() : qualityChoice.value
  return pickVideoFormat(formats, { maxHeight, isSupported })
}

/** A player source for the given video format, streaming from the current SABR input. */
function buildSource(videoFormat: SabrFormat | undefined): PlayerSource | undefined {
  const sabr = input
  const audio = audioFormat
  if (!sabr || !videoFormat?.mimeType || !audio?.mimeType) {
    return undefined
  }
  const videoId = props.playback.videoId
  return {
    videoMimeType: videoFormat.mimeType,
    audioMimeType: audio.mimeType,
    durationSeconds: duration.value,
    open: (startTimeMs) => openStream(sabr, {
      startTimeMs,
      videoFormat,
      audioFormat: audio,
      fetch: bridgeFetch,
      mintPoToken: () => window.fraitube.refreshPoToken(videoId),
      reloadStreaming: (reloadToken) => window.fraitube.reloadStreaming(videoId, reloadToken),
      onError: () => void recover()
    })
  }
}

/** Starts a new video at the given position. */
function startVideo(startSeconds: number): void {
  const element = videoElement.value
  const videoFormat = wantedVideoFormat()
  const source = buildSource(videoFormat)
  if (!element || !videoFormat || !source) {
    error.value = 'No playable formats were found.'
    return
  }
  player?.destroy()
  error.value = ''
  startingAt.value = startSeconds
  playingHeight.value = qualityHeight(videoFormat)
  player = attachPlayer(element, source, { startSeconds, onError: () => void recover() })
  if (props.waitForHandOver) {
    holdForHandOver(startSeconds)
  } else {
    void element.play().catch(() => undefined)
  }
}

/**
 * Moves to the quality the current choice asks for. The video holds its last picture, paused with a
 * loading sign, and carries on at exactly the same position once the new quality is there.
 */
async function applyQuality(): Promise<void> {
  const element = videoElement.value
  const videoFormat = wantedVideoFormat()
  if (!player || !element || recovering || !videoFormat || qualityHeight(videoFormat) === playingHeight.value) {
    return
  }
  const source = buildSource(videoFormat)
  if (!source) {
    return
  }
  const id = loadId
  const wasPlaying = !element.paused || (reloading.value && resumeAfterReload)
  element.pause()
  const position = element.currentTime
  const height = qualityHeight(videoFormat)
  playingHeight.value = height
  switchingTo.value = qualities.value.find((quality) => quality.height === height)?.label ?? `${height}p`
  reloading.value = true
  resumeAfterReload = wasPlaying
  try {
    await player.switchSource(source, position)
    if (id === loadId && wasPlaying) {
      void element.play().catch(() => undefined)
    }
  } catch {
    if (id === loadId) {
      void recover(wasPlaying)
    }
  } finally {
    if (id === loadId) {
      switchingTo.value = ''
      if (!recovering) {
        reloading.value = false
        resumeAfterReload = false
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Fetches fresh playback data and moves the player onto it at the given position. */
async function reconnect(position: number, id: number): Promise<void> {
  const fresh = await window.fraitube.getPlayback(props.playback.videoId, true)
  if (id !== loadId || !player) return
  if (!fresh.sabr) {
    throw new Error(fresh.reason ?? `This video cannot be played (${fresh.status}).`)
  }
  input = { videoId: fresh.videoId, ...fresh.sabr }
  formats = listFormats(input)
  audioFormat = pickAudioFormat(formats, { isSupported })
  qualities.value = listQualities(formats, isSupported)
  const videoFormat = wantedVideoFormat()
  const source = buildSource(videoFormat)
  if (!videoFormat || !source) {
    throw new Error('No playable formats were found.')
  }
  playingHeight.value = qualityHeight(videoFormat)
  await player.switchSource(source, position)
}

/**
 * Reconnects a stopped video with fresh playback data and carries on from the same position, trying
 * again with growing waits for as long as the video is open. The last picture stays on screen with
 * "Reconnecting", and fullscreen, volume, quality and subtitles stay.
 */
async function recover(resume?: boolean): Promise<void> {
  const element = videoElement.value
  if (recovering || !player || !element) {
    return
  }
  const id = loadId
  recovering = true
  reloading.value = true
  reconnecting.value = true
  resumeAfterReload = resume ?? !element.paused
  element.pause()
  const position = element.currentTime
  if (Date.now() - lastTroubleAt > RECONNECT_CALM_MS) {
    reconnectAttempt = 0
  }
  try {
    for (;;) {
      await delay(reconnectWaitMs(reconnectAttempt++))
      lastTroubleAt = Date.now()
      if (id !== loadId || !player) return
      try {
        await reconnect(position, id)
        break
      } catch {
        // Tried again after the next wait.
      }
    }
    if (id !== loadId) return
    error.value = ''
    if (resumeAfterReload) {
      void element.play().catch(() => undefined)
    }
  } finally {
    if (id === loadId) {
      recovering = false
      reloading.value = false
      reconnecting.value = false
      resumeAfterReload = false
    }
  }
}

function chooseQuality(value: string): void {
  qualityChoice.value = value === 'auto' ? 'auto' : Number(value)
  void applyQuality()
}

/** In auto quality, a bigger or smaller player switches quality once the size has settled. */
function onBoxResize(): void {
  clearTimeout(autoTimer)
  autoTimer = setTimeout(applyAutoQuality, AUTO_QUALITY_DELAY_MS)
}

/**
 * Auto quality follows the player's size and the quality cap. A player kept out of sight keeps its
 * quality, so the video plays on without a pause until the PiP window takes over.
 */
function applyAutoQuality(): void {
  if (qualityChoice.value === 'auto' && !props.offPage) {
    void applyQuality()
  }
}

async function chooseSubtitles(trackId: string): Promise<void> {
  subtitleTrack.value = trackId
  subtitleError.value = ''
  cues.value = []
  subtitleText.value = ''
  autoSubtitles = false
  if (!trackId) {
    return
  }
  const videoId = props.playback.videoId
  const auto = props.playback.captions.find((track) => track.id === trackId)?.auto ?? false
  try {
    let loaded = cueCache.get(trackId)
    if (!loaded) {
      const fetched = await window.fraitube.getCaptions(videoId, trackId)
      loaded = auto ? rollCues(fetched) : fetched
      cueCache.set(trackId, loaded)
    }
    if (subtitleTrack.value === trackId && props.playback.videoId === videoId) {
      autoSubtitles = auto
      cues.value = loaded
    }
  } catch {
    // The menu goes back to off, and the line stays until subtitles are chosen again or the video changes.
    if (subtitleTrack.value === trackId && props.playback.videoId === videoId) {
      subtitleTrack.value = ''
      subtitleError.value = 'These subtitles could not be loaded'
    }
  }
}

/** Subtitles on with the preferred language, or off. */
function toggleSubtitles(): void {
  if (subtitleTrack.value) {
    void chooseSubtitles('')
    return
  }
  const language = String(settings[PlayerSettingKey.subtitleLanguage] ?? '')
  const track = pickCaptionTrack(props.playback.captions, language) ?? props.playback.captions[0]
  if (track) {
    void chooseSubtitles(track.id)
  }
}

async function load(): Promise<void> {
  const id = ++loadId
  savePosition()
  trackedVideoId = undefined
  player?.destroy()
  player = undefined
  recovering = false
  reloading.value = false
  reconnecting.value = false
  switchingTo.value = ''
  startingAt.value = undefined
  resumeAfterReload = false
  reconnectAttempt = 0
  lastTroubleAt = 0
  error.value = ''
  cueCache.clear()
  cues.value = []
  subtitleText.value = ''
  subtitleTrack.value = ''
  subtitleError.value = ''
  segments.value = []
  segmentsError.value = ''
  segmentMuted.value = false
  skippedSegment.value = undefined
  clearTimeout(skipNoticeTimer)
  undoneSegments = new Set()
  qualityChoice.value = 'auto'
  currentTime.value = 0
  bufferedEnd.value = 0
  waitingFrom = undefined
  clearTimeout(handOverTimer)

  const result = props.playback
  if (!result.sabr) {
    input = undefined
    qualities.value = []
    error.value = result.reason ?? `This video cannot be played (${result.status}).`
    return
  }

  input = { videoId: result.videoId, ...result.sabr }
  formats = listFormats(input)
  audioFormat = pickAudioFormat(formats, { isSupported })
  qualities.value = listQualities(formats, isSupported)
  const savedStart = await startPosition(result)
  if (id !== loadId) {
    return
  }
  startVideo(props.startSeconds ?? savedStart)
  void loadSegments(result.videoId, id)

  const startTrack = startingSubtitleTrack(
    props.startSubtitles,
    result.captions,
    settings[PlayerSettingKey.subtitlesOnStart] === true,
    String(settings[PlayerSettingKey.subtitleLanguage] ?? '')
  )
  if (startTrack) {
    void chooseSubtitles(startTrack)
  }
}

function togglePlay(): void {
  const element = videoElement.value
  if (!element) return
  if (element.paused) {
    void element.play().catch(() => undefined)
  } else {
    element.pause()
  }
}

function seekTo(seconds: number): void {
  const element = videoElement.value
  if (!element) return
  element.currentTime = Math.min(Math.max(0, seconds), duration.value || seconds)
  currentTime.value = element.currentTime
  savePosition()
}

function seekBy(seconds: number): void {
  seekTo((videoElement.value?.currentTime ?? 0) + seconds)
}

function pause(): void {
  videoElement.value?.pause()
  resumeAfterReload = false
}

/** True while the video plays, or is held only for a quality switch or recovery and plays again afterwards. */
function isPlaying(): boolean {
  const element = videoElement.value
  return element !== null && (!element.paused || (reloading.value && resumeAfterReload))
}

/** The exact second the video is at, read from the video itself rather than the last frame drawn. */
function playheadSeconds(): number {
  return videoElement.value?.currentTime ?? currentTime.value
}

/** The second a player waiting to take over a video starts buffering from, while it waits. */
let waitingFrom: number | undefined
let handOverTimer: ReturnType<typeof setTimeout> | undefined

/** Holds a video loaded with `waitForHandOver` paused at its start until it can take over. */
function holdForHandOver(startSeconds: number): void {
  waitingFrom = startSeconds
  clearTimeout(handOverTimer)
  handOverTimer = setTimeout(readyToTakeOver, HAND_OVER_WAIT_MS)
}

function readyToTakeOver(): void {
  if (waitingFrom === undefined) {
    return
  }
  waitingFrom = undefined
  clearTimeout(handOverTimer)
  emit('readyToTakeOver')
}

watch(bufferedEnd, (end) => {
  if (waitingFrom !== undefined && bufferedForHandOver(end, waitingFrom, duration.value)) {
    readyToTakeOver()
  }
})

/**
 * Starts a video that waited to take over, at the exact second the other player reached when one is
 * given. A video that was paused there stays paused here.
 */
function takeOver(seconds?: number, wasPaused?: boolean): void {
  if (seconds !== undefined) {
    seekTo(seconds)
  }
  if (wasPaused !== true) {
    void videoElement.value?.play().catch(() => undefined)
  }
}

/** The watch page jumps to chapters and follows the playing time; the frame pauses and checks it. */
/** The subtitle track showing, or empty while subtitles are off. */
function subtitleTrackId(): string {
  return subtitleTrack.value
}

defineExpose({ seekTo, currentTime, pause, isPlaying, playheadSeconds, takeOver, subtitleTrackId })

function onSeekInput(event: Event): void {
  seekPreview.value = Number((event.target as HTMLInputElement).value)
}

function onSeekChange(event: Event): void {
  seekPreview.value = undefined
  seekTo(Number((event.target as HTMLInputElement).value))
}

function setVolume(percent: number): void {
  volume.value = Math.min(Math.max(0, Math.round(percent)), MAX_VOLUME)
  if (volume.value > 0) {
    muted.value = false
  }
  clearTimeout(volumeTimer)
  volumeTimer = setTimeout(() => {
    setSetting(PlayerSettingKey.volume, volume.value).catch(reportError)
  }, SAVE_VOLUME_DELAY_MS)
}

function onVolumeInput(event: Event): void {
  setVolume(Number((event.target as HTMLInputElement).value))
}

function toggleMute(): void {
  muted.value = !muted.value
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void box.value?.requestFullscreen().catch(reportError)
  }
}

/** The PiP button leaves full screen first, so the main window is back to normal when the video moves. */
async function openPip(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined)
  }
  emit('pip')
}

function showControls(): void {
  controlsShown.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (!paused.value) {
      controlsShown.value = false
    }
  }, HIDE_CONTROLS_MS)
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox'
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.compact || props.offPage || event.ctrlKey || event.altKey || event.metaKey || isTyping(event.target)) {
    return
  }
  const actions: Record<string, () => void> = {
    ' ': togglePlay,
    k: togglePlay,
    ArrowLeft: () => seekBy(-SEEK_STEP_SECONDS),
    ArrowRight: () => seekBy(SEEK_STEP_SECONDS),
    j: () => seekBy(-JUMP_STEP_SECONDS),
    l: () => seekBy(JUMP_STEP_SECONDS),
    ArrowUp: () => setVolume(volume.value + VOLUME_STEP),
    ArrowDown: () => setVolume(volume.value - VOLUME_STEP),
    m: toggleMute,
    c: toggleSubtitles,
    f: toggleFullscreen
  }
  const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key]
  if (action) {
    event.preventDefault()
    action()
    showControls()
  }
}

function updateBuffered(element: HTMLVideoElement): void {
  const ranges = element.buffered
  const time = element.currentTime
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= time + 0.5 && ranges.end(i) >= time) {
      bufferedEnd.value = ranges.end(i)
      return
    }
  }
  bufferedEnd.value = time
}

/** Follows the playhead every frame, so subtitles and the seek bar stay exact. */
function tick(): void {
  const element = videoElement.value
  if (element) {
    if (seekPreview.value === undefined) {
      currentTime.value = element.currentTime
    }
    updateBuffered(element)
    const showing = cues.value.length > 0 ? activeCueText(cues.value, element.currentTime) : ''
    // Auto-generated subtitles show two rows at most, as on youtube.com.
    const text = autoSubtitles ? newestRows(showing) : showing
    if (text !== subtitleText.value) {
      subtitleText.value = text
    }
    if (segments.value.length > 0) {
      applySegments(element)
    }
  }
  frame = requestAnimationFrame(tick)
}

function onFullscreenChange(): void {
  fullscreen.value = document.fullscreenElement === box.value
}

function onVideoResize(): void {
  const element = videoElement.value
  if (element) {
    videoSize.value = { width: element.videoWidth, height: element.videoHeight }
  }
}

watch([volume, muted, segmentMuted], ([level, isMuted, inMuteSegment]) => {
  volumeControl?.setVolume(level)
  volumeControl?.setMuted(isMuted || inMuteSegment)
})

watch(() => props.playback, () => void load())

// The corner player is never full screen.
watch(() => props.compact, (compact) => {
  if (compact && document.fullscreenElement) {
    void document.exitFullscreen()
  }
})

// A new quality cap applies to the playing video when it picks its quality itself.
watch(() => settings[PlayerSettingKey.defaultQuality], applyAutoQuality)

// Turning SponsorBlock on or off applies to the playing video.
watch(() => settings[SponsorBlockSettingKey.enabled], () => {
  segments.value = []
  segmentsError.value = ''
  segmentMuted.value = false
  skippedSegment.value = undefined
  if (input) {
    void loadSegments(props.playback.videoId, loadId)
  }
})

onMounted(() => {
  const element = videoElement.value
  if (element) {
    volumeControl = getVolumeControl(element)
    volumeControl.setVolume(volume.value)
    volumeControl.setMuted(muted.value)
  }
  if (box.value) {
    resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        boxSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
      }
      onBoxResize()
    })
    resizeObserver.observe(box.value)
  }
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  frame = requestAnimationFrame(tick)
  window.addEventListener('beforeunload', savePosition)
  positionTimer = setInterval(() => {
    if (!paused.value) {
      savePosition()
    }
  }, SAVE_POSITION_MS)
  void load()
})

onBeforeUnmount(() => {
  savePosition()
  trackedVideoId = undefined
  clearTimeout(handOverTimer)
  clearInterval(positionTimer)
  clearTimeout(skipNoticeTimer)
  window.removeEventListener('beforeunload', savePosition)
  loadId++
  player?.destroy()
  player = undefined
  cancelAnimationFrame(frame)
  clearTimeout(hideTimer)
  clearTimeout(autoTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (volumeTimer !== undefined) {
    clearTimeout(volumeTimer)
    setSetting(PlayerSettingKey.volume, volume.value).catch(() => undefined)
  }
})
</script>

<template>
  <div
    ref="box"
    class="player"
    :class="{ idle: !controlsShown }"
    @mousemove="showControls"
    @mouseleave="paused || (controlsShown = false)"
  >
    <video
      ref="video"
      @click="togglePlay"
      @dblclick="compact || toggleFullscreen()"
      @play="paused = false; showControls()"
      @pause="paused = true; controlsShown = true; savePosition()"
      @ended="savePosition"
      @waiting="buffering = true"
      @playing="onPlaying"
      @canplay="buffering = false"
      @loadeddata="startingAt = undefined"
      @loadedmetadata="onVideoResize"
      @resize="onVideoResize"
    />
    <div
      class="subtitles"
      :style="subtitleLook.box"
    >
      <span
        v-if="subtitleText"
        class="cue"
        :style="subtitleLook.cue"
      >{{ subtitleText }}</span>
    </div>
    <p
      v-if="error"
      class="message error"
    >
      {{ error }}
    </p>
    <p
      v-else-if="status"
      class="message"
    >
      {{ status }}
    </p>
    <div
      v-if="skippedSegment"
      class="skip-notice"
    >
      <span>Skipped {{ categoryNoun(skippedSegment.category) }}</span>
      <button
        type="button"
        @click="undoSkip"
      >
        Undo
      </button>
    </div>
    <div
      class="controls"
      @dblclick.stop
    >
      <p
        v-if="subtitleError"
        class="notice error"
      >
        {{ subtitleError }}
      </p>
      <p
        v-if="segmentsError"
        class="notice error"
      >
        {{ segmentsError }}
      </p>
      <div
        ref="seekBar"
        class="seek"
        @mousemove="onSeekHover"
        @mouseleave="onSeekLeave"
      >
        <div
          v-if="preview"
          class="preview"
          :style="{ left: preview.left }"
        >
          <div
            v-if="preview.picture"
            class="preview-picture"
            :style="preview.picture"
          />
          <span class="preview-text">
            {{ preview.time }}<template v-if="preview.chapter"> &middot; {{ preview.chapter }}</template>
          </span>
        </div>
        <div class="track">
          <div
            class="buffered"
            :style="{ width: `${bufferedPercent}%` }"
          />
          <div
            class="played"
            :style="{ width: `${playedPercent}%` }"
          />
          <div
            v-for="gap in chapterGaps"
            :key="gap"
            class="chapter-gap"
            :style="{ left: `${gap}%` }"
          />
          <div
            v-for="mark in segmentMarks"
            :key="mark.key"
            class="segment"
            :class="{ point: mark.point }"
            :style="{ left: `${mark.left}%`, width: mark.point ? undefined : `${mark.width}%`, background: mark.color }"
          />
        </div>
        <input
          type="range"
          aria-label="Seek"
          min="0"
          :max="duration"
          step="0.1"
          :value="shownTime"
          @input="onSeekInput"
          @change="onSeekChange"
        >
      </div>
      <div class="bar">
        <button
          type="button"
          :aria-label="paused ? 'Play' : 'Pause'"
          @click="togglePlay"
        >
          {{ paused ? 'Play' : 'Pause' }}
        </button>
        <span class="volume-group">
          <button
            type="button"
            :aria-label="muted ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            {{ muted ? 'Unmute' : 'Mute' }}
          </button>
          <span
            v-if="!compact"
            class="volume-control"
          >
            <input
              class="volume"
              type="range"
              aria-label="Volume"
              min="0"
              :max="MAX_VOLUME"
              step="5"
              :value="muted ? 0 : volume"
              @input="onVolumeInput"
            >
            <span class="value">{{ muted ? 0 : volume }}%</span>
          </span>
        </span>
        <span class="time">{{ formatTime(shownTime) }} / {{ formatTime(duration) }}</span>
        <span
          v-if="currentChapter && !compact"
          class="chapter"
          :title="currentChapter.title"
        >{{ currentChapter.title }}</span>
        <span class="spacer" />
        <template v-if="!compact">
          <select
            aria-label="Subtitles"
            :value="subtitleTrack"
            @change="chooseSubtitles(($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              Subtitles off
            </option>
            <option
              v-for="track in playback.captions"
              :key="track.id"
              :value="track.id"
            >
              {{ track.label }}
            </option>
          </select>
          <select
            aria-label="Quality"
            :value="String(qualityChoice)"
            @change="chooseQuality(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">
              Auto{{ qualityChoice === 'auto' && qualityLabel ? ` (${qualityLabel})` : '' }}
            </option>
            <option
              v-for="quality in qualities"
              :key="quality.height"
              :value="String(quality.height)"
            >
              {{ quality.label }}
            </option>
          </select>
          <button
            type="button"
            class="pip-button"
            title="Picture in picture"
            aria-label="Picture in picture"
            @click="openPip"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <rect
                x="2.5"
                y="4.5"
                width="19"
                height="15"
                rx="2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect
                x="12"
                y="11"
                width="8"
                height="6"
                rx="1"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
            @click="toggleFullscreen"
          >
            {{ fullscreen ? 'Exit full screen' : 'Full screen' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The controls follow the player's own width, so they fit on the watch page, in PiP and on phones. */
.player {
  container-type: inline-size;
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #000000;
  color: #ffffff;
}

.player:fullscreen {
  aspect-ratio: auto;
}

.player.idle {
  cursor: none;
}

video {
  display: block;
  width: 100%;
  height: 100%;
}

.subtitles {
  position: absolute;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: none;
}

.cue {
  max-width: 90%;
  padding: 0.1em 0.4em;
  line-height: 1.3;
  text-align: center;
  white-space: pre-line;
}

.message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 16px;
  text-align: center;
  pointer-events: none;
}

.error {
  color: #ff8a8a;
}

.notice {
  margin: 0 0 6px;
  font-size: 0.85rem;
}

.controls {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  padding: 24px 12px 8px;
  background: linear-gradient(transparent, rgb(0 0 0 / 70%));
  transition: opacity 0.2s;
}

.idle .controls {
  opacity: 0;
  pointer-events: none;
}

.seek {
  position: relative;
  height: 16px;
}

.track {
  position: absolute;
  inset-inline: 0;
  top: 6px;
  height: 4px;
  background: rgb(255 255 255 / 25%);
}

.buffered,
.played {
  position: absolute;
  inset-block: 0;
  left: 0;
}

.buffered {
  background: rgb(255 255 255 / 45%);
}

.segment {
  position: absolute;
  inset-block: 0;
  opacity: 0.9;
}

.segment.point {
  width: 3px;
  margin-inline-start: -1px;
}

.chapter-gap {
  position: absolute;
  inset-block: 0;
  width: 2px;
  margin-inline-start: -1px;
  background: #000000;
}

.preview {
  position: absolute;
  inset-block-end: calc(100% + 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transform: translateX(-50%);
  pointer-events: none;
}

.preview-picture {
  border: 2px solid #ffffff;
  border-radius: 6px;
  background-color: #000000;
  background-repeat: no-repeat;
}

.preview-text {
  max-inline-size: 320px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgb(0 0 0 / 75%);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter {
  min-inline-size: 0;
  overflow: hidden;
  font-size: 0.85rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.skip-notice {
  position: absolute;
  inset-inline-end: 12px;
  inset-block-end: 76px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgb(0 0 0 / 75%);
  font-size: 0.85rem;
}

.skip-notice button {
  padding: 4px 8px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 6px;
  background: rgb(0 0 0 / 40%);
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.played {
  background: var(--color-accent);
}

.seek input {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-block-start: 4px;
}

.bar select {
  max-inline-size: 11em;
}

.volume-group,
.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-group {
  position: relative;
}

.spacer {
  flex: 1;
}

.bar button,
.bar select {
  padding: 4px 8px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 6px;
  background: rgb(0 0 0 / 40%);
  color: #ffffff;
  font: inherit;
  font-size: 0.85rem;
}

.bar select option {
  background: #212121;
}

.bar .pip-button {
  display: inline-flex;
  align-items: center;
  padding-block: 3px;
}

.volume {
  inline-size: 96px;
  accent-color: var(--color-accent);
}

.value,
.time {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.value {
  min-inline-size: 3.5em;
}

/* Narrow players: the volume slider opens above the Mute button, and the chapter title is left out. */
@container (width < 560px) {
  .volume-control {
    position: absolute;
    inset-block-end: 100%;
    inset-inline-start: 0;
    z-index: 1;
    display: none;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgb(0 0 0 / 80%);
  }

  .volume-group:hover .volume-control,
  .volume-group:focus-within .volume-control {
    display: flex;
  }

  .chapter {
    display: none;
  }

  .controls {
    padding-inline: 8px;
  }

  .skip-notice {
    inset-inline-end: 8px;
    inset-block-end: 104px;
  }
}
</style>
