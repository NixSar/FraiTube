<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chapterIndexAt } from '@fraitube/player'
import AboutSection from './AboutSection.vue'
import ChapterList from './ChapterList.vue'
import CommentsSection from './CommentsSection.vue'
import WatchActions from './WatchActions.vue'
import { startSecondsFrom, subtitlesFrom, withoutStart } from '../../../shared/pip'
import { controls, details, loadingVideo, markShort, openVideo, pageSlot, playback, playbackError } from './nowPlaying'
import { VIDEO_DETAILS_STATUS } from './playerStatus'
import WaitingMessage from '../../components/WaitingMessage.vue'

const route = useRoute()
const router = useRouter()
const playerSlot = useTemplateRef<HTMLDivElement>('playerSlot')
const currentChapter = computed(() => chapterIndexAt(details.value?.chapters ?? [], controls.value?.currentTime ?? 0))

function seekTo(seconds: number): void {
  controls.value?.seekTo(seconds)
}

/** The video whose "t" and "cc" were read and are being taken out of the address. */
let readStartOf: string | undefined

// "cc" is the subtitle track of a video coming back from the PiP window, empty for off.
// "t" and "cc" are read once and then leave the address, so going back or forward to this page
// resumes the video from its saved position.
watch(() => [route.params['videoId'], route.query['t'], route.query['cc']], ([videoId, t, cc]) => {
  if (typeof videoId !== 'string') {
    return
  }
  // A short's card and a Shorts link open the page with "short", so the history saves it as a short.
  if (route.query['short'] === '1') {
    markShort(videoId)
  }
  const cleaned = withoutStart(route.query)
  if (!cleaned && readStartOf === videoId) {
    // The address of the video already opened, now without "t" and "cc".
    readStartOf = undefined
    return
  }
  readStartOf = undefined
  void openVideo(videoId, startSecondsFrom(t), subtitlesFrom(cc))
  if (cleaned) {
    readStartOf = videoId
    void router.replace({ params: route.params, query: cleaned })
  }
}, { immediate: true })

// The frame shows the player in this place while the page is open.
onMounted(() => {
  pageSlot.value = playerSlot.value ?? undefined
})

onBeforeUnmount(() => {
  pageSlot.value = undefined
})
</script>

<template>
  <div class="watch">
    <div class="stage">
      <div
        ref="playerSlot"
        class="slot"
      />
      <p
        v-if="!playback && loadingVideo"
        class="message"
      >
        <WaitingMessage :text="VIDEO_DETAILS_STATUS" />
      </p>
    </div>
    <p
      v-if="playbackError"
      class="error"
    >
      {{ playbackError }}
    </p>
    <template v-if="details">
      <h1>{{ details.title }}</h1>
      <AboutSection
        :key="details.videoId"
        :about="details.about"
        :channel-id="details.channelId"
        :channel-name="details.author"
        @seek="seekTo"
      >
        <template #actions>
          <WatchActions :video-id="details.videoId" />
        </template>
      </AboutSection>
      <ChapterList
        v-if="details.chapters.length > 0"
        :chapters="details.chapters"
        :current="currentChapter"
        :storyboard="details.storyboard"
        @seek="seekTo"
      />
      <CommentsSection
        :key="details.videoId"
        :video-id="details.videoId"
        @seek="seekTo"
      />
    </template>
  </div>
</template>

<style scoped>
.watch {
  max-inline-size: 1280px;
  min-inline-size: 0;
}

.stage {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000000;
  color: #ffffff;
}

.slot {
  position: absolute;
  inset: 0;
}

.message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
}

h1 {
  font-size: 1.3rem;
  margin: 12px 0 4px;
  overflow-wrap: anywhere;
}

/* Phones: the player reaches the window edges and the title is smaller. */
@media (width < 600px) {
  .stage {
    margin-inline: -8px;
  }

  h1 {
    font-size: 1.1rem;
  }
}

.error {
  color: #ff6b6b;
}
</style>
