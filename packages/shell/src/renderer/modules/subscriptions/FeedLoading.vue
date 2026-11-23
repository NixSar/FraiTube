<script setup lang="ts">
import ChannelAvatar from './ChannelAvatar.vue'
import type { FeedLoadingView } from './feedLoading'

/** The progress bar while the feed is fetched, with the channel icons lighting up as they arrive. */
defineProps<{ view: FeedLoadingView; showChannels: boolean }>()
</script>

<template>
  <div
    class="loading"
    role="status"
  >
    <div
      class="bar"
      role="progressbar"
      aria-label="Fetching channels"
      :aria-valuenow="Math.round(view.percent)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span
        class="fill"
        :style="{ inlineSize: `${view.percent}%` }"
      />
    </div>
    <p class="text">
      {{ view.text }}
    </p>
    <ul
      v-if="showChannels"
      class="channels"
    >
      <li
        v-for="channel in view.channels"
        :key="channel.id"
        class="channel"
        :class="{ done: channel.done }"
        :title="channel.name"
      >
        <ChannelAvatar
          :name="channel.name"
          :avatar="channel.avatar"
          :size="40"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.loading {
  margin-block: 12px 16px;
}

.bar {
  block-size: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--color-border);
}

.fill {
  display: block;
  block-size: 100%;
  border-radius: 3px;
  background: var(--color-accent);
  transition: inline-size 0.4s ease;
}

.text {
  margin: 8px 0 0;
  opacity: 0.75;
  font-size: 0.9rem;
}

.channels {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.channel {
  display: flex;
  filter: grayscale(1);
  opacity: 0.3;
  transition: filter 0.6s ease, opacity 0.6s ease;
}

.channel.done {
  filter: none;
  opacity: 1;
}
</style>
