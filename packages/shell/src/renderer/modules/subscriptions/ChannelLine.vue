<script setup lang="ts">
import { computed } from 'vue'
import ChannelAvatar from './ChannelAvatar.vue'
import { useSubscriptions } from './store'

/** A channel's icon and name in a line; the icon is the one given, or the saved icon of a subscribed channel. */
const props = defineProps<{ channelId: string; name: string; avatar?: string; size?: number }>()

const { avatarOf } = useSubscriptions()
const shownAvatar = computed(() => props.avatar || avatarOf(props.channelId))
</script>

<template>
  <span class="channel-line">
    <ChannelAvatar
      :name="name || channelId"
      :avatar="shownAvatar"
      :size="size ?? 20"
    />
    <span class="name">{{ name }}</span>
  </span>
</template>

<style scoped>
.channel-line {
  display: flex;
  gap: 6px;
  align-items: center;
  min-inline-size: 0;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
