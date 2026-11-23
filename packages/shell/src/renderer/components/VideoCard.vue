<script setup lang="ts">
import { computed } from 'vue'
import type { WatchProgress } from '../../shared/history'
import ChannelLine from '../modules/subscriptions/ChannelLine.vue'
import { cardDetails } from './videoCard'

/** One video in a grid: thumbnail with its length or watch progress, title, channel and details. */
const props = defineProps<{
  videoId: string
  title: string
  thumbnail: string
  badge?: string
  /** How far the video was watched, when it counts as played. */
  progress?: WatchProgress
  /** Shows the card dimmed, for a played video. */
  faded?: boolean
  channelId: string
  channelName: string
  channelAvatar?: string
  details: readonly (string | undefined)[]
}>()

const detailsText = computed(() => cardDetails(props.details))
</script>

<template>
  <article
    class="video-card"
    :class="{ faded }"
  >
    <RouterLink
      class="link"
      :to="{ name: 'watch', params: { videoId } }"
    >
      <div class="thumbnail">
        <img
          v-if="thumbnail"
          :src="thumbnail"
          alt=""
          loading="lazy"
          decoding="async"
        >
        <span
          v-if="progress"
          class="badge watched-label"
        >{{ progress.label }}</span>
        <span
          v-else-if="badge"
          class="badge"
        >{{ badge }}</span>
        <div
          v-if="progress"
          class="progress"
        >
          <div
            class="watched"
            :style="{ width: `${progress.percent}%` }"
          />
        </div>
      </div>
      <div class="text">
        <div
          class="title"
          :title="title"
        >
          {{ title }}
        </div>
        <ChannelLine
          v-if="channelName"
          class="meta"
          :channel-id="channelId"
          :name="channelName"
          :avatar="channelAvatar"
        />
        <div
          v-if="detailsText"
          class="meta"
        >
          {{ detailsText }}
        </div>
      </div>
    </RouterLink>
    <div
      v-if="$slots['actions']"
      class="actions"
    >
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
/* Cards outside the visible part of the page are skipped while the page is drawn and laid out. */
.video-card {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}

/* A played card dims its picture and text; the watched bar and time label stay at full strength. */
.video-card.faded .thumbnail img,
.video-card.faded .text,
.video-card.faded .actions {
  opacity: 0.5;
}

.video-card.faded:hover .thumbnail img,
.video-card.faded:hover .text,
.video-card.faded:hover .actions {
  opacity: 0.85;
}

.link {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  border-radius: 8px;
  color: var(--color-text);
  text-decoration: none;
}

.link:hover {
  background: var(--color-hover);
}

.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface);
}

.thumbnail img {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.badge {
  position: absolute;
  inset-inline-end: 6px;
  inset-block-end: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(0 0 0 / 80%);
  color: #ffffff;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.watched-label {
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 600;
}

.progress {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: 6px;
  /* A dark track, so the blue stands out on bright and dark pictures alike. */
  background: rgb(0 0 0 / 75%);
}

.watched {
  block-size: 100%;
  background: var(--color-accent);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-inline-size: 0;
}

.title {
  display: -webkit-box;
  overflow: hidden;
  font-weight: 600;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}

.meta {
  opacity: 0.75;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  padding-inline: 4px;
}
</style>
