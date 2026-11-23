<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import type { CommentSort, VideoComment } from '@fraitube/youtube/types'
import CommentItem from './CommentItem.vue'
import { canFetchMore } from './commentPaging'

const props = defineProps<{ videoId: string }>()
const emit = defineEmits<{ seek: [seconds: number] }>()

const sort = ref<CommentSort>('top')
const comments = ref<VideoComment[]>([])
const continuation = ref<string>()
const countText = ref('')
const turnedOffText = ref('')
const loading = ref(false)
const error = ref('')
const end = useTemplateRef<HTMLDivElement>('end')
let loadId = 0
let observer: IntersectionObserver | undefined

/**
 * Loads the first page in the chosen order, or the next page when `more` is set. After a failed page,
 * scrolling fetches nothing more until Try again (`retry`) is pressed.
 */
async function load(more: boolean, retry = false): Promise<void> {
  if (more && !canFetchMore({ continuation: continuation.value, loading: loading.value, failed: error.value !== '' }, retry)) return
  const id = ++loadId
  const request = { videoId: props.videoId, sort: sort.value, continuation: more ? continuation.value : undefined }
  if (!more) {
    comments.value = []
    continuation.value = undefined
  }
  loading.value = true
  error.value = ''
  try {
    const page = await window.fraitube.getComments(request)
    if (id !== loadId) return
    comments.value = more ? [...comments.value, ...page.comments] : page.comments
    continuation.value = page.continuation
    if (!more) {
      countText.value = page.countText
      turnedOffText.value = page.turnedOffText
    }
  } catch (cause) {
    if (id === loadId) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (id === loadId) {
      loading.value = false
      // The end may still be in view after a short page, so the next page loads without waiting for a scroll.
      requestAnimationFrame(checkEnd)
    }
  }
}

function checkEnd(): void {
  const element = end.value
  if (element && element.getBoundingClientRect().top < window.innerHeight) {
    void load(true)
  }
}

function chooseSort(value: CommentSort): void {
  if (value !== sort.value) {
    sort.value = value
    void load(false)
  }
}

onMounted(() => {
  void load(false)
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      void load(true)
    }
  }, { rootMargin: '400px' })
  if (end.value) {
    observer.observe(end.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  loadId++
})
</script>

<template>
  <section class="comments">
    <p
      v-if="turnedOffText"
      class="notice"
    >
      {{ turnedOffText }}
    </p>
    <template v-else>
      <div class="header">
        <h2>{{ countText || 'Comments' }}</h2>
        <div
          class="sort"
          role="group"
          aria-label="Sort comments"
        >
          <button
            type="button"
            :class="{ selected: sort === 'top' }"
            @click="chooseSort('top')"
          >
            Top
          </button>
          <button
            type="button"
            :class="{ selected: sort === 'newest' }"
            @click="chooseSort('newest')"
          >
            Newest
          </button>
        </div>
      </div>
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        :video-id="videoId"
        :sort="sort"
        @seek="emit('seek', $event)"
      />
    </template>
    <p v-if="loading">
      Loading comments
    </p>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
      <button
        type="button"
        class="retry"
        @click="load(comments.length > 0, true)"
      >
        Try again
      </button>
    </p>
    <div ref="end" />
  </section>
</template>

<style scoped>
.comments {
  margin-block: 24px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: 1.1rem;
}

.sort {
  display: flex;
  gap: 6px;
}

.sort button {
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.sort button.selected {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.notice {
  opacity: 0.8;
}

.error {
  color: #ff6b6b;
}

.retry {
  margin-inline-start: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
}
</style>
