<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { normalizeAvatar } from '@fraitube/subscriptions'
import type { ChannelInfo, VideoResult } from '@fraitube/youtube/types'
import { MAX_QUERY_LENGTH } from '../../../shared/bridge'
import VideoCard from '../../components/VideoCard.vue'
import VideoGrid from '../../components/VideoGrid.vue'
import { cardBadge, cardDetails } from '../../components/videoCard'
import { usePaging } from '../../components/paging'
import { playInNewWindowItem, type VideoMenuItem } from '../../components/videoMenu'
import { useFavoriteMenuItem } from '../favorites/store'
import { useWatchedMenuItem, useWatchProgress } from '../history/progress'
import ChannelAvatar from './ChannelAvatar.vue'
import SubscribeButton from './SubscribeButton.vue'
import { useSubscriptions } from './store'

const route = useRoute()
const router = useRouter()
const { avatarOf } = useSubscriptions()
const channel = ref<ChannelInfo>()
const videos = ref<VideoResult[]>([])
const continuation = ref<string>()
const loading = ref(false)
const error = ref('')
const loadId = ref(0)
const { progressOf } = useWatchProgress()
const { watchedItem } = useWatchedMenuItem()
const { favoriteItem } = useFavoriteMenuItem()
const { shown, hasMore, showMore } = usePaging(() => videos.value, () => loadId.value)

/** A channel video's menu; its length is not read here, so it is saved as 0. */
function menuItems(video: VideoResult): VideoMenuItem[] {
  const details = { videoId: video.id, title: video.title, channelId: video.channelId, channelName: video.channelName, durationSeconds: 0 }
  return [playInNewWindowItem(video.id), watchedItem(details), favoriteItem(details)]
}

function currentChannelId(): string {
  const id = route.params['channelId']
  return typeof id === 'string' ? id : ''
}

/** The search inside the channel, kept in the address so it is still there after going back. */
function currentQuery(): string {
  const q = route.query['q']
  return typeof q === 'string' ? q.trim() : ''
}

const searchText = ref(currentQuery())

/** Searches the channel for the typed text; an empty field goes back to the newest videos. */
function search(): void {
  const q = searchText.value.trim().slice(0, MAX_QUERY_LENGTH)
  void router.replace({ query: q ? { q } : {} })
}

async function load(more: boolean): Promise<void> {
  const channelId = currentChannelId()
  if (!channelId) {
    return
  }
  const query = currentQuery()
  const id = more ? loadId.value : ++loadId.value
  if (!more) {
    if (channel.value?.id !== channelId) {
      channel.value = undefined
    }
    videos.value = []
    continuation.value = undefined
  }
  loading.value = true
  error.value = ''
  try {
    const page = await window.fraitube.getChannelVideos({
      channelId,
      ...(query && { query }),
      continuation: more ? continuation.value : undefined
    })
    if (id !== loadId.value) {
      return
    }
    if (page.channel) {
      channel.value = { ...page.channel, avatar: normalizeAvatar(page.channel.avatar) }
      document.title = `${page.channel.name || channelId} - FraiTube`
    }
    const seen = new Set(videos.value.map((video) => video.id))
    videos.value.push(...page.videos.filter((video) => !seen.has(video.id)))
    continuation.value = page.continuation
  } catch (cause) {
    if (id === loadId.value) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    if (id === loadId.value) {
      loading.value = false
    }
  }
}

watch(() => [route.params['channelId'], route.query['q']], () => {
  searchText.value = currentQuery()
  void load(false)
}, { immediate: true })
</script>

<template>
  <div class="channel-page">
    <header
      v-if="channel"
      class="header"
    >
      <ChannelAvatar
        :name="channel.name || channel.id"
        :avatar="channel.avatar || avatarOf(channel.id)"
        :size="80"
      />
      <div class="channel-text">
        <h1>{{ channel.name }}</h1>
        <div
          v-if="channel.handle || channel.subscribersText"
          class="meta"
        >
          {{ cardDetails([channel.handle, channel.subscribersText]) }}
        </div>
      </div>
      <SubscribeButton :channel="{ id: channel.id, name: channel.name || channel.id, avatar: channel.avatar }" />
      <form
        class="channel-search"
        role="search"
        @submit.prevent="search"
      >
        <input
          v-model="searchText"
          type="search"
          :maxlength="MAX_QUERY_LENGTH"
          placeholder="Search this channel"
          aria-label="Search this channel"
          @search="search"
        >
      </form>
    </header>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>

    <VideoGrid
      v-if="videos.length > 0"
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
          :faded="progressOf(video.id) !== undefined"
          :channel-id="video.channelId"
          :channel-name="video.channelName"
          :channel-avatar="channel?.avatar"
          :details="[video.viewsText, video.publishedText]"
          :menu-items="menuItems(video)"
        />
      </li>
    </VideoGrid>

    <p
      v-if="!loading && !error && channel && videos.length === 0"
      class="meta"
    >
      {{ currentQuery() ? 'No videos on this channel match the search.' : 'This channel has no videos.' }}
    </p>
    <p
      v-if="loading"
      class="meta"
    >
      Loading
    </p>
    <button
      v-if="continuation && !loading && !hasMore"
      type="button"
      class="more"
      @click="load(true)"
    >
      More videos
    </button>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-block-end: 16px;
}

.channel-text {
  flex: 1;
  min-inline-size: 0;
}

.channel-search input {
  inline-size: 200px;
  max-inline-size: 100%;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.channel-text h1 {
  margin: 0;
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
