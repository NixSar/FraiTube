<script setup lang="ts">
import { previewPictureStyle } from '@fraitube/player'
import type { Chapter, Storyboard } from '@fraitube/youtube/types'
import { formatClock } from '../../../shared/history'

const props = defineProps<{ chapters: Chapter[]; current: number; storyboard?: Storyboard }>()
const emit = defineEmits<{ seek: [seconds: number] }>()

/** Width of a chapter's picture, in pixels. */
const PICTURE_WIDTH = 156

/** The frame at the chapter's start, from the seek bar's preview pictures; YouTube's chapter picture without them. */
function frameStyle(chapter: Chapter): Record<string, string> | undefined {
  return props.storyboard ? previewPictureStyle(props.storyboard, chapter.startSeconds, PICTURE_WIDTH) : undefined
}
</script>

<template>
  <section class="chapters">
    <h2>Chapters</h2>
    <ol>
      <li
        v-for="(chapter, index) in chapters"
        :key="chapter.startSeconds"
      >
        <button
          type="button"
          :class="{ current: index === current }"
          @click="emit('seek', chapter.startSeconds)"
        >
          <span
            v-if="storyboard"
            class="frame"
            :style="frameStyle(chapter)"
          />
          <img
            v-else-if="chapter.thumbnail"
            :src="chapter.thumbnail"
            alt=""
            loading="lazy"
          >
          <span class="text">
            <span class="title">{{ chapter.title || `Chapter ${index + 1}` }}</span>
            <span class="start">{{ formatClock(chapter.startSeconds) }}</span>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.chapters {
  min-inline-size: 0;
  margin-block-start: 16px;
}

h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

ol {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0 0 8px;
  overflow-x: auto;
  list-style: none;
}

button {
  display: flex;
  flex-direction: column;
  gap: 6px;
  inline-size: 168px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

button.current {
  border-color: var(--color-accent);
}

.frame {
  display: block;
  border-radius: 4px;
  background-color: #000000;
  background-repeat: no-repeat;
}

img {
  inline-size: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 4px;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 0.9rem;
}

.start {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
</style>
