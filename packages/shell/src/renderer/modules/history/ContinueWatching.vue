<script setup lang="ts">
import { computed } from 'vue'
import { continueWatching, timeLeftText, videoThumbnail, watchedPercent, type HistoryEntry } from '../../../shared/history'
import VideoMenu from '../../components/VideoMenu.vue'
import { playInNewWindowItem, type VideoMenuItem } from '../../components/videoMenu'
import { useFavoriteMenuItem } from '../favorites/store'
import { useHistoryEntries, useWatchedMenuItem } from './progress'

/** The side column's list of videos last stopped partway, each opening where it stopped. */
const entries = useHistoryEntries()
const videos = computed(() => continueWatching(entries.value.values()))
const { watchedItem } = useWatchedMenuItem()
const { favoriteItem } = useFavoriteMenuItem()

/** Each video's menu, so right-clicking or long-pressing its row opens it. */
const menus = new Map<string, InstanceType<typeof VideoMenu>>()

function setMenu(videoId: string, menu: unknown): void {
  if (menu) {
    menus.set(videoId, menu as InstanceType<typeof VideoMenu>)
  } else {
    menus.delete(videoId)
  }
}

function menuItems(video: HistoryEntry): VideoMenuItem[] {
  return [playInNewWindowItem(video.videoId), watchedItem(video), favoriteItem(video)]
}
</script>

<template>
  <section
    v-if="videos.length > 0"
    class="continue"
    aria-label="Continue watching"
  >
    <h2>Continue watching</h2>
    <div class="rows">
      <div
        v-for="video in videos"
        :key="video.videoId"
        class="row"
        @contextmenu="menus.get(video.videoId)?.openAt($event)"
      >
        <RouterLink
          class="item"
          :to="{ name: 'watch', params: { videoId: video.videoId } }"
          :title="video.title"
        >
          <span class="picture">
            <img
              :src="videoThumbnail(video.videoId)"
              alt=""
              loading="lazy"
              decoding="async"
            >
            <span
              class="watched"
              :style="{ width: `${watchedPercent(video)}%` }"
            />
          </span>
          <span class="text">
            <span class="title">{{ video.title }}</span>
            <span class="left">{{ timeLeftText(video) }}</span>
          </span>
        </RouterLink>
        <VideoMenu
          :ref="(menu) => setMenu(video.videoId, menu)"
          :items="menuItems(video)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Lined above and below; the heading stays while the videos scroll when they do not all fit. */
.continue {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-block-size: 0;
  margin-block-start: 12px;
  padding-block: 8px;
  border-block: 1px solid var(--color-border);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-block-size: 0;
  overflow-y: auto;
}

h2 {
  margin: 0;
  padding: 4px 8px;
  font-size: 0.8rem;
  font-weight: normal;
  opacity: 0.7;
}

.row {
  display: flex;
  align-items: flex-start;
  border-radius: 6px;
}

.row:hover {
  background: var(--color-hover);
}

/* With a mouse the ⋮ button shows while the row is pointed at or focused; touch screens always show it. */
@media (hover: hover) {
  .row:not(:hover, :focus-within) > :deep(.more:not([aria-expanded="true"])) {
    opacity: 0;
  }
}

.item {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: flex-start;
  min-inline-size: 0;
  padding: 6px 0 6px 8px;
  color: var(--color-text);
  text-decoration: none;
}

.row > :deep(.more) {
  flex: none;
  margin-block-start: 4px;
}

.picture {
  position: relative;
  flex: none;
  inline-size: 64px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 4px;
  background: rgb(0 0 0 / 75%);
}

.picture img {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.watched {
  position: absolute;
  inset-inline-start: 0;
  inset-block-end: 0;
  block-size: 3px;
  background: var(--color-accent);
}

.text {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  font-size: 0.8rem;
  line-height: 1.3;
}

.title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.left {
  opacity: 0.7;
}
</style>
