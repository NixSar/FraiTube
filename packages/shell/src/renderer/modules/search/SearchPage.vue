<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { normalizeAvatar } from '@fraitube/subscriptions'
import type { ChannelResult, SearchFilter, VideoResult } from '@fraitube/youtube/types'
import ChannelAvatar from '../subscriptions/ChannelAvatar.vue'
import VideoCard from '../../components/VideoCard.vue'
import VideoGrid from '../../components/VideoGrid.vue'
import { cardBadge, cardDetails } from '../../components/videoCard'
import { usePaging } from '../../components/paging'
import { useWatchProgress } from '../history/progress'
import SubscribeButton from '../subscriptions/SubscribeButton.vue'
import { useSubscriptions } from '../subscriptions/store'

const FILTERS: { value: SearchFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'videos', label: 'Videos' },
  { value: 'channels', label: 'Channels' }
]

const route = useRoute()
const { avatarOf } = useSubscriptions()
const videos = ref<VideoResult[]>([])
const channels = ref<ChannelResult[]>([])
const continuation = ref<string>()
const loading = ref(false)
const error = ref('')
const { progressOf } = useWatchProgress()
const { shown, hasMore, showMore } = usePaging(() => videos.value)
let searchId = 0

function currentQuery(): string {
  const q = route.query['q']
  return typeof q === 'string' ? q.trim() : ''
}

function currentFilter(): SearchFilter {
  const type = route.query['type']
  return FILTERS.some((filter) => filter.value === type) ? (type as SearchFilter) : 'all'
}

async function load(more: boolean): Promise<void> {
  const query = currentQuery()
  if (!query) {
    return
  }
  const id = more ? searchId : ++searchId
  if (!more) {
    videos.value = []
    channels.value = []
    continuation.value = undefined
  }
  loading.value = true
  error.value = ''

  try {
    const page = await window.fraitube.search({ query, filter: currentFilter(), continuation: more ? continuation.value : undefined })
    if (id !== searchId) {
      return
    }
    const seenVideos = new Set(videos.value.map((video) => video.id))
    const seenChannels = new Set(channels.value.map((channel) => channel.id))
    videos.value.push(...page.videos.filter((video) => !seenVideos.has(video.id)))
    channels.value.push(...page.channels.filter((channel) => !seenChannels.has(channel.id)))
    continuation.value = page.continuation
  } catch (cause) {
    if (id === searchId) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (id === searchId) {
      loading.value = false
    }
  }
}

watch(() => [route.query['q'], route.query['type']], () => {
  void load(false)
}, { immediate: true })
</script>

<template>
  <div class="search-page">
    <nav class="filters">
      <RouterLink
        v-for="filter in FILTERS"
        :key="filter.value"
        :to="{ name: 'search', query: { q: currentQuery(), type: filter.value === 'all' ? undefined : filter.value } }"
        class="filter"
        :class="{ active: currentFilter() === filter.value }"
      >
        {{ filter.label }}
      </RouterLink>
    </nav>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>

    <section
      v-if="channels.length > 0"
      class="group"
    >
      <h2>Channels</h2>
      <ul class="channels">
        <li
          v-for="channel in channels"
          :key="channel.id"
          class="channel"
        >
          <ChannelAvatar
            :name="channel.name || channel.id"
            :avatar="normalizeAvatar(channel.avatar) || avatarOf(channel.id)"
            :size="64"
          />
          <div class="channel-text">
            <div class="name">
              {{ channel.name }}
            </div>
            <div class="meta">
              {{ cardDetails([channel.handle, channel.subscribersText]) }}
            </div>
          </div>
          <SubscribeButton :channel="{ id: channel.id, name: channel.name || channel.id, avatar: normalizeAvatar(channel.avatar) }" />
        </li>
      </ul>
    </section>

    <section
      v-if="videos.length > 0"
      class="group"
    >
      <h2>Videos</h2>
      <VideoGrid
        :has-more="hasMore"
        @more="showMore"
      >
        <li
          v-for="video in shown"
          :key="video.id"
        >
          <VideoCard
            :video-id="video.id"
            :title="video.title"
            :thumbnail="video.thumbnail"
            :badge="cardBadge(video)"
            :progress="progressOf(video.id)"
            :channel-id="video.channelId"
            :channel-name="video.channelName"
            :channel-avatar="normalizeAvatar(video.channelAvatar)"
            :details="[video.viewsText, video.publishedText]"
          />
        </li>
      </VideoGrid>
    </section>

    <p
      v-if="!loading && !error && videos.length === 0 && channels.length === 0 && currentQuery()"
      class="meta"
    >
      No results.
    </p>
    <p
      v-if="loading"
      class="meta"
    >
      Searching
    </p>
    <button
      v-if="continuation && !loading"
      type="button"
      class="more"
      @click="load(true)"
    >
      More results
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-block-end: 16px;
}

.filter {
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  text-decoration: none;
}

.filter.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}

h2 {
  font-size: 1.1rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.channels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.channel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.channel-text {
  flex: 1;
  min-inline-size: 0;
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.meta {
  opacity: 0.75;
  font-size: 0.9rem;
}

.more {
  margin-block: 16px;
  padding: 8px 16px;
  border: 0;
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  cursor: pointer;
}

.error {
  color: #ff6b6b;
}
</style>
