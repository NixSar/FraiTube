<script setup lang="ts">
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { MIN_CARD_WIDTH } from './videoCard'

/** A list of video cards in as many columns as fit, one column on phones. */
const props = defineProps<{
  /** True while the list has more cards than it shows; "more" is then sent as the end comes near. */
  hasMore?: boolean
}>()
const emit = defineEmits<{ more: [] }>()

const minCardWidth = `${MIN_CARD_WIDTH}px`
/** How close to the end, in pixels, more cards are asked for. */
const NEAR_END_PX = 800

const end = useTemplateRef<HTMLDivElement>('end')
let observer: IntersectionObserver | undefined

/** The element the page scrolls in, so "near the end" is measured inside it. */
function scrollingParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === 'auto' || overflow === 'scroll') {
      return parent
    }
  }
  return null
}

function stop(): void {
  observer?.disconnect()
  observer = undefined
}

watch([end, () => props.hasMore], ([element, hasMore]) => {
  stop()
  if (!element || !hasMore) {
    return
  }
  observer = new IntersectionObserver((records) => {
    if (records.some((record) => record.isIntersecting)) {
      emit('more')
      // Watched again once the new cards are in, so a list that still ends in view asks again.
      observer?.unobserve(element)
      void nextTick(() => observer?.observe(element))
    }
  }, { root: scrollingParent(element), rootMargin: `0px 0px ${NEAR_END_PX}px 0px` })
  observer.observe(element)
}, { flush: 'post' })

onBeforeUnmount(stop)
</script>

<template>
  <ul
    class="video-grid"
    :style="{ '--min-card-width': minCardWidth }"
  >
    <slot />
  </ul>
  <div
    v-if="hasMore"
    ref="end"
    class="end"
    aria-hidden="true"
  />
</template>

<style scoped>
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(var(--min-card-width), 100%), 1fr));
  gap: 20px 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.video-grid > :slotted(li) {
  min-inline-size: 0;
}

.end {
  block-size: 1px;
}
</style>
