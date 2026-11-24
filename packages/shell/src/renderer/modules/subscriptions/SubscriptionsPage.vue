<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { timeAgo } from '@fraitube/subscriptions'
import type { Feed, FeedVideo } from '@fraitube/subscriptions/types'
import type { FeedProgress } from '../../../shared/bridge'
import VideoCard from '../../components/VideoCard.vue'
import VideoGrid from '../../components/VideoGrid.vue'
import { usePaging } from '../../components/paging'
import { playInNewWindowItem, type VideoMenuItem } from '../../components/videoMenu'
import { useFavoriteMenuItem } from '../favorites/store'
import { useHistoryEntries, useWatchedMenuItem, useWatchProgress } from '../history/progress'
import FeedFilterBar from './FeedFilterBar.vue'
import { DEFAULT_FEED_FILTERS, feedChannels, feedFiltersQuery, filterFeed, hasActiveFilters, readFeedFilters, type FeedFilters } from './feedFilters'
import FeedLoading from './FeedLoading.vue'
import { feedLoadingView } from './feedLoading'
import { useSubscriptions } from './store'

/** A load that ends sooner than this, such as one served from the last fetch, shows no progress bar. */
const LOADING_SCREEN_DELAY_MS = 300

const { subscriptions, ready } = useSubscriptions()
const feed = ref<Feed>()
const loading = ref(false)
/** The channels fetched so far, while a fetch runs. */
const fetching = ref<FeedProgress>()
/** True once a running load has taken longer than LOADING_SCREEN_DELAY_MS. */
const slow = ref(false)
let slowTimer: ReturnType<typeof setTimeout> | undefined
const error = ref('')
const now = ref(Date.now())
const loadId = ref(0)
const { progressOf } = useWatchProgress()
const { watchedItem } = useWatchedMenuItem()
const { favoriteItem } = useFavoriteMenuItem()

/** A feed video's menu; its length is unknown here, so it is saved as 0. */
function menuItems(video: FeedVideo): VideoMenuItem[] {
  const details = { videoId: video.id, title: video.title, channelId: video.channelId, channelName: video.channelName, durationSeconds: 0 }
  return [playInNewWindowItem(video.id), watchedItem(details), favoriteItem(details)]
}
const route = useRoute()
const router = useRouter()
const historyEntries = useHistoryEntries()

// The filters are kept in the page address, so Back and a new window keep them. The bar shows
// each change at once, before the address follows.
const filters = ref<FeedFilters>(readFeedFilters(route.query))
watch(() => route.query, (query) => {
  const next = readFeedFilters(query)
  if (JSON.stringify(next) !== JSON.stringify(filters.value)) {
    filters.value = next
  }
})

function setFilters(next: FeedFilters): void {
  filters.value = next
  void router.replace({ query: feedFiltersQuery(next) })
}

const channels = computed(() => feedChannels(feed.value?.videos ?? []))
/** The filters as applied: a channel with no videos in the feed counts as every channel. */
const applied = computed(() => {
  const channel = filters.value.channel
  return channel && !channels.value.some((known) => known.id === channel) ? { ...filters.value, channel: '' } : filters.value
})
const filtered = computed(() =>
  filterFeed(feed.value?.videos ?? [], applied.value, (videoId) => historyEntries.value.get(videoId), now.value))
const noMatch = computed(() => (feed.value?.videos.length ?? 0) > 0 && filtered.value.length === 0 && hasActiveFilters(applied.value))

const { shown, hasMore, showMore } = usePaging(() => filtered.value, () => `${loadId.value} ${JSON.stringify(applied.value)}`)
const loadingView = computed(() => feedLoadingView(subscriptions.value, fetching.value))

// Keeps the "ago" texts current while the page stays open.
const clock = setInterval(() => {
  now.value = Date.now()
}, 60_000)
onBeforeUnmount(() => {
  clearInterval(clock)
  clearTimeout(slowTimer)
})

// The progress bar and channel icons follow the channels fetched; videos show only with the finished feed.
const stopProgress = window.fraitube.onFeedProgress((progress) => {
  if (loading.value) {
    fetching.value = progress
  }
})
onBeforeUnmount(stopProgress)

async function load(refresh: boolean): Promise<void> {
  const id = ++loadId.value
  loading.value = true
  fetching.value = undefined
  slow.value = false
  clearTimeout(slowTimer)
  slowTimer = setTimeout(() => {
    slow.value = true
  }, LOADING_SCREEN_DELAY_MS)
  error.value = ''
  try {
    const result = await window.fraitube.getFeed(refresh)
    if (id === loadId.value) {
      feed.value = result
      now.value = Date.now()
    }
  } catch (cause) {
    if (id === loadId.value) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (id === loadId.value) {
      loading.value = false
      fetching.value = undefined
      slow.value = false
      clearTimeout(slowTimer)
    }
  }
}

// The feed follows the subscription list, so a new subscription shows up without a manual refresh.
// It stops following once the page is closed.
let closed = false
let stopFollowing: (() => void) | undefined
void ready.then(() => {
  if (closed) {
    return
  }
  stopFollowing = watch(() => subscriptions.value.map((subscription) => subscription.id).join(','), () => {
    void load(false)
  }, { immediate: true })
})
onBeforeUnmount(() => {
  closed = true
  stopFollowing?.()
})
</script>

<template>
  <div class="feed-page">
    <header class="header">
      <h1>New videos</h1>
      <span
        v-if="feed && !loading"
        class="meta"
      >Updated {{ timeAgo(feed.updatedAt, now) }}</span>
      <button
        type="button"
        class="action"
        :disabled="loading"
        @click="load(true)"
      >
        Refresh
      </button>
    </header>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p
      v-if="feed && !loading && feed.failedChannels.length > 0"
      class="error"
    >
      Could not load: {{ feed.failedChannels.map((channel) => channel.name).join(', ') }}
    </p>
    <p
      v-if="subscriptions.length === 0"
      class="meta"
    >
      No subscriptions yet. Subscribe on a video or in search, or import them on the
      <RouterLink :to="{ name: 'channels' }">
        Subscriptions
      </RouterLink> page.
    </p>
    <FeedLoading
      v-else-if="loading && (fetching || slow)"
      :view="loadingView"
      :show-channels="!feed"
    />

    <FeedFilterBar
      v-if="feed && subscriptions.length > 0"
      :filters="filters"
      :channels="channels"
      @change="setFilters"
    />
    <div
      v-if="noMatch"
      class="no-match"
    >
      <p class="meta">
        No videos match these filters.
      </p>
      <button
        type="button"
        class="action"
        @click="setFilters(DEFAULT_FEED_FILTERS)"
      >
        Clear filters
      </button>
    </div>

    <VideoGrid
      v-if="feed && subscriptions.length > 0"
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
          :progress="progressOf(video.id)"
          :faded="progressOf(video.id) !== undefined"
          :channel-id="video.channelId"
          :channel-name="video.channelName"
          :details="[video.viewsText, timeAgo(video.publishedAt, now)]"
          :menu-items="menuItems(video)"
        />
      </li>
    </VideoGrid>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.header h1 {
  flex: 1;
}

.action {
  padding: 8px 16px;
  border: 0;
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  cursor: pointer;
}

.action:disabled {
  opacity: 0.6;
}

.meta {
  opacity: 0.75;
  font-size: 0.9rem;
}

.error {
  color: #ff6b6b;
}

.no-match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
</style>
