<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { continueWatching, timeLeftText, videoThumbnail, watchedPercent } from '../../../shared/history'
import { useHistoryEntries } from './progress'

/** The side column's list of videos last stopped partway, each opening where it stopped. */
const entries = useHistoryEntries()
const videos = computed(() => continueWatching(entries.value.values()))

/** Width of the right-click menu, in pixels, used to keep it inside the window. */
const MENU_WIDTH = 230
/** Height of the right-click menu, in pixels, used to keep it inside the window. */
const MENU_HEIGHT = 40

/** The right-click menu: the video it is for and where it shows. */
const menu = ref<{ videoId: string; left: number; top: number }>()
const menuButton = useTemplateRef<HTMLButtonElement>('menuButton')

function openMenu(event: MouseEvent, videoId: string): void {
  event.preventDefault()
  // A menu opened from the keyboard has no pointer position, so it shows under the item.
  const item = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX > 0 || event.clientY > 0 ? event.clientX : item.left + 8
  const y = event.clientX > 0 || event.clientY > 0 ? event.clientY : item.bottom
  menu.value = {
    videoId,
    left: Math.max(0, Math.min(x, window.innerWidth - MENU_WIDTH)),
    top: Math.max(0, Math.min(y, window.innerHeight - MENU_HEIGHT))
  }
  addCloseListeners()
  void nextTick(() => menuButton.value?.focus())
}

function closeMenu(): void {
  menu.value = undefined
  removeCloseListeners()
}

/** Removes the video from Continue watching; the next one in the list takes its place. */
function hide(): void {
  const videoId = menu.value?.videoId
  closeMenu()
  if (videoId) {
    // When saving fails, the video simply stays in the list.
    window.fraitube.hideFromContinueWatching(videoId).catch(() => undefined)
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node && menuButton.value?.contains(event.target))) {
    closeMenu()
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

function addCloseListeners(): void {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('blur', closeMenu)
}

function removeCloseListeners(): void {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('blur', closeMenu)
}

onBeforeUnmount(removeCloseListeners)
</script>

<template>
  <section
    v-if="videos.length > 0"
    class="continue"
    aria-label="Continue watching"
  >
    <h2>Continue watching</h2>
    <RouterLink
      v-for="video in videos"
      :key="video.videoId"
      class="item"
      :to="{ name: 'watch', params: { videoId: video.videoId } }"
      :title="video.title"
      @contextmenu="openMenu($event, video.videoId)"
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
  </section>
  <Teleport to="body">
    <div
      v-if="menu"
      class="menu"
      role="menu"
      :style="{ left: `${menu.left}px`, top: `${menu.top}px`, inlineSize: `${MENU_WIDTH}px` }"
    >
      <button
        ref="menuButton"
        type="button"
        role="menuitem"
        @click="hide"
      >
        Remove from Continue watching
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.continue {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-block-start: 12px;
  padding-block-start: 8px;
  border-block-start: 1px solid var(--color-border);
}

h2 {
  margin: 0;
  padding: 4px 8px;
  font-size: 0.8rem;
  font-weight: normal;
  opacity: 0.7;
}

.item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--color-text);
  text-decoration: none;
}

.item:hover {
  background: var(--color-hover);
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

.menu {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
}

.menu button {
  display: block;
  inline-size: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: 0.875rem;
  text-align: start;
  cursor: pointer;
}

.menu button:hover,
.menu button:focus-visible {
  background: var(--color-hover);
  outline: none;
}
</style>
