<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VideoPlayback } from '@fraitube/youtube/types'
import { startSecondsFrom, subtitlesFrom } from '../../../shared/pip'
import BusySpinner from '../../components/BusySpinner.vue'
import { VIDEO_DETAILS_STATUS } from './playerStatus'
import { createPipReturn, RETURNING_STATUS } from './pipReturn'
import VideoPlayer from './VideoPlayer.vue'

/** The PiP window's page: the video alone, dragged by the picture, with Back and Close. */
const route = useRoute()
const player = useTemplateRef<InstanceType<typeof VideoPlayer>>('player')
const playback = shallowRef<VideoPlayback>()
const start = ref<number>()
/** The subtitle track the video brought from its watch page, empty for off. */
const subtitles = ref<string>()
const error = ref('')
let loadId = 0

watch(() => [route.params['videoId'], route.query['t'], route.query['cc']], async ([videoId, t, cc]) => {
  if (typeof videoId !== 'string') {
    return
  }
  const id = ++loadId
  playback.value = undefined
  error.value = ''
  start.value = startSecondsFrom(t)
  subtitles.value = subtitlesFrom(cc)
  try {
    const result = await window.fraitube.getPlayback(videoId)
    if (id === loadId) {
      playback.value = result
      document.title = `${result.title} - FraiTube`
    }
  } catch (cause) {
    if (id === loadId) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
}, { immediate: true })

const pipReturn = createPipReturn((videoId, seconds, cc) => window.fraitube.pipBack(videoId, seconds, cc), () => window.close())
const returning = pipReturn.returning

const stopPauseListening = window.fraitube.onPauseRequested(() => {
  player.value?.pause()
})

// The watch page takes over after Back: this video stops and gives the second it reached and whether it was paused.
const stopHandOverListening = window.fraitube.onHandOverRequested(() => {
  const playing = player.value
  if (!playing) {
    return undefined
  }
  const given = { seconds: playing.playheadSeconds(), paused: !playing.isPlaying() }
  playing.pause()
  return given
})

onBeforeUnmount(() => {
  stopPauseListening()
  stopHandOverListening()
  pipReturn.stop()
})

/** The video has buffered here: it carries on from the second the app window's player reached, paused when that one was. */
async function takeOver(): Promise<void> {
  const given = await window.fraitube.takeOverPlayback()
  player.value?.takeOver(given?.seconds, given?.paused)
}

/**
 * The video loads on its watch page and takes over from here once buffered; this video plays on until
 * then. Back works once: it is disabled and a notice shows while the video returns.
 */
function back(): void {
  const video = playback.value
  if (video) {
    pipReturn.back(video.videoId, player.value?.playheadSeconds() ?? start.value ?? 0, player.value?.subtitleTrackId() ?? subtitles.value ?? '')
  }
}

function close(): void {
  window.close()
}

/** Pixels the pointer moves before a press on the picture becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4
let press: { x: number; y: number; dragging: boolean } | undefined
let swallowClick = false

/** A press on the picture itself moves the window; the controls and buttons work as usual. */
function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !(event.target instanceof HTMLVideoElement)) {
    return
  }
  press = { x: event.screenX, y: event.screenY, dragging: false }
}

function onPointerMove(event: PointerEvent): void {
  if (!press) {
    return
  }
  const dx = event.screenX - press.x
  const dy = event.screenY - press.y
  if (!press.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
    return
  }
  if (!press.dragging) {
    // Captured only once it is a drag, so a plain click still reaches the video.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    press.dragging = true
  }
  press.x = event.screenX
  press.y = event.screenY
  window.fraitube.movePip(dx, dy)
}

function onPointerUp(): void {
  swallowClick = press?.dragging === true
  press = undefined
}

/** A drag ends without the click that would pause or play the video. */
function onClickCapture(event: MouseEvent): void {
  if (swallowClick) {
    swallowClick = false
    event.stopPropagation()
    event.preventDefault()
  }
}
</script>

<template>
  <div
    class="pip"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click.capture="onClickCapture"
  >
    <VideoPlayer
      v-if="playback"
      :key="`${playback.videoId}:${start ?? ''}`"
      ref="player"
      :playback="playback"
      :start-seconds="start"
      :start-subtitles="subtitles"
      compact
      wait-for-hand-over
      @ready-to-take-over="takeOver"
    />
    <p
      v-else
      class="message"
      :class="{ error }"
    >
      <span v-if="error">{{ error }}</span>
      <span v-else><BusySpinner />{{ VIDEO_DETAILS_STATUS }}</span>
    </p>
    <p
      v-if="returning"
      class="returning"
      role="status"
    >
      <span><BusySpinner />{{ RETURNING_STATUS }}</span>
    </p>
    <div class="bar">
      <span
        class="title"
        :title="playback?.title"
      >{{ playback?.title }}</span>
      <button
        type="button"
        title="Back to the watch page"
        :disabled="returning"
        @click="back"
      >
        Back
      </button>
      <button
        type="button"
        title="Stop the video"
        @click="close"
      >
        Close
      </button>
    </div>
  </div>
</template>

<style scoped>
.pip {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000000;
  color: #ffffff;
  user-select: none;
}

.pip :deep(.player) {
  inline-size: 100%;
  block-size: 100%;
  aspect-ratio: auto;
}

.message {
  display: grid;
  place-items: center;
  block-size: 100%;
  margin: 0;
  padding: 16px;
  text-align: center;
}

.message.error {
  color: #ff8a8a;
}

/* Over the picture, always shown, while the video goes back to the watch page. */
.returning {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  pointer-events: none;
}

.returning > span {
  padding: 6px 12px;
  border-radius: 14px;
  background: rgb(0 0 0 / 70%);
  font-size: 0.85rem;
}

/* Shown while the pointer is over the window, like the controls. */
.bar {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px 16px;
  background: linear-gradient(rgb(0 0 0 / 70%), transparent);
  opacity: 0;
  transition: opacity 0.2s;
}

.pip:hover .bar,
.bar:focus-within {
  opacity: 1;
}

.title {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button {
  padding: 3px 10px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 12px;
  background: rgb(0 0 0 / 40%);
  color: #ffffff;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
