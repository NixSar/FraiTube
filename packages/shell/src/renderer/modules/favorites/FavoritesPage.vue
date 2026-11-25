<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { timeAgo } from '@fraitube/subscriptions'
import { videoThumbnail } from '../../../shared/history'
import { SettingKey, shortsShown, withoutHiddenShorts } from '../../../shared/settings'
import { settings } from '../../settings'
import { usePaging } from '../../components/paging'
import VideoCard from '../../components/VideoCard.vue'
import VideoGrid from '../../components/VideoGrid.vue'
import { playInNewWindowItem } from '../../components/videoMenu'
import { useWatchedMenuItem, useWatchProgress } from '../history/progress'
import { useFavoriteMenuItem, useFavorites } from './store'

/** The favorite videos, the last added first. */
const { favorites, loaded } = useFavorites()
const { favoriteItem } = useFavoriteMenuItem()
const { watchedItem } = useWatchedMenuItem()
const { progressOf } = useWatchProgress()
/** The favorites shown: shorts only while Show Shorts is on. */
const shownFavorites = computed(() => withoutHiddenShorts(favorites.value, shortsShown(settings[SettingKey.showShorts])))
const { shown, hasMore, showMore } = usePaging(() => shownFavorites.value)

// The "added" texts stay current.
const now = ref(Date.now())
const clock = setInterval(() => {
  now.value = Date.now()
}, 60_000)
onBeforeUnmount(() => {
  clearInterval(clock)
})
</script>

<template>
  <div class="favorites-page">
    <h1>Favorites</h1>
    <p
      v-if="loaded && shownFavorites.length === 0"
      class="meta"
    >
      No favorites yet. Add videos from their ⋮ menu.
    </p>
    <VideoGrid
      :has-more="hasMore"
      @more="showMore"
    >
      <li
        v-for="favorite in shown"
        :key="favorite.videoId"
      >
        <VideoCard
          :video-id="favorite.videoId"
          :title="favorite.title || favorite.videoId"
          :thumbnail="videoThumbnail(favorite.videoId)"
          :progress="progressOf(favorite.videoId)"
          :faded="progressOf(favorite.videoId) !== undefined"
          :channel-id="favorite.channelId"
          :channel-name="favorite.channelName"
          :channel-avatar="favorite.channelAvatar"
          :details="[`Added ${timeAgo(favorite.addedAt, now)}`]"
          :menu-items="[playInNewWindowItem(favorite.videoId, favorite.short), watchedItem(favorite), favoriteItem(favorite)]"
          :short="favorite.short"
        />
      </li>
    </VideoGrid>
  </div>
</template>

<style scoped>
.meta {
  opacity: 0.75;
  font-size: 0.9rem;
}
</style>
