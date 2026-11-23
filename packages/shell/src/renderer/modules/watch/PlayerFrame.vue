<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import VideoPlayer from './VideoPlayer.vue'
import {
  canGoBackFromPip,
  closeVideo,
  controls,
  handingOff,
  handOffToPip,
  handOverNow,
  pageSlot,
  placeAfterLeaving,
  playback,
  returnFromPip,
  startSeconds,
  startSubtitles,
  takingOver
} from './nowPlaying'
import { subtitlesFrom } from '../../../shared/pip'

const router = useRouter()
const player = useTemplateRef<InstanceType<typeof VideoPlayer>>('player')

watch(player, (instance) => {
  controls.value = instance ?? undefined
})

/** Off the watch page, the player stays mounted out of sight, playing on until the PiP window takes over. */
const offPage = computed(() => !pageSlot.value)

// Decided before the watch page goes: a playing video plays on out of sight while the PiP window
// loads it, and stops once the PiP window takes over at the second it reached. Any other video closes.
const removeGuard = router.beforeEach(async (to, from) => {
  if (from.name !== 'watch' || to.name === 'watch' || handingOff.value) {
    return
  }
  if (placeAfterLeaving(controls.value?.isPlaying() === true) === 'pip' && handOffToPip()) {
    return
  }
  closeVideo()
  await nextTick()
})

/** The player's PiP button: the video moves to the PiP window and this window leaves the watch page. */
function toPip(): void {
  if (!handOffToPip()) {
    return
  }
  const back: unknown = (window.history.state as { back?: unknown } | null)?.back
  if (canGoBackFromPip(back, (path) => router.resolve(path).name)) {
    router.back()
  } else {
    void router.push('/')
  }
}

const stopHandOverListening = window.fraitube.onHandOverRequested(handOverNow)

/** A video back from the PiP window has buffered here: it carries on from the second PiP reached, paused when PiP was. */
async function onReadyToTakeOver(): Promise<void> {
  const given = await window.fraitube.takeOverPlayback()
  takingOver.value = false
  controls.value?.takeOver(given?.seconds, given?.paused)
}

const stopPauseListening = window.fraitube.onPauseRequested(() => {
  controls.value?.pause()
})

// The PiP window's Back button: its video loads on its watch page here, and takes over from the PiP
// window once buffered. The same video still playing here simply carries on where it is.
// Its subtitle track comes along, so subtitles stay as they were in PiP.
const stopReturnListening = window.fraitube.onPipReturned((videoId, seconds, subtitles) => {
  void router.push({ name: 'watch', params: { videoId }, query: returnFromPip(videoId, seconds, subtitlesFrom(subtitles)) })
})

onBeforeUnmount(() => {
  removeGuard()
  stopHandOverListening()
  stopPauseListening()
  stopReturnListening()
})
</script>

<template>
  <div
    v-if="playback && (pageSlot || handingOff)"
    class="holder"
  >
    <Teleport
      :to="pageSlot ?? 'body'"
      :disabled="offPage"
    >
      <VideoPlayer
        ref="player"
        :playback="playback"
        :start-seconds="startSeconds"
        :start-subtitles="startSubtitles"
        :off-page="offPage"
        :wait-for-hand-over="takingOver"
        @pip="toPip"
        @ready-to-take-over="onReadyToTakeOver"
      />
    </Teleport>
  </div>
</template>

<style scoped>
/* Out of sight but full size, so the video keeps playing and picks its quality as usual. */
.holder {
  position: fixed;
  inset-block-start: 0;
  inset-inline-start: -10000px;
  inline-size: 960px;
  opacity: 0;
  pointer-events: none;
}
</style>
