<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { isChannelId } from '@fraitube/subscriptions'
import ChannelAvatar from './ChannelAvatar.vue'
import { useSubscriptions } from './store'

/**
 * A channel's icon and name in a line; the icon is the one given, or the saved icon of a subscribed channel.
 * A click opens the channel's page. It works inside a video card's link without opening the video.
 */
const props = defineProps<{ channelId: string; name: string; avatar?: string; size?: number }>()

const router = useRouter()
const { avatarOf } = useSubscriptions()
const shownAvatar = computed(() => props.avatar || avatarOf(props.channelId))
const linked = computed(() => isChannelId(props.channelId))

function open(event: Event): void {
  if (!linked.value) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  void router.push({ name: 'channel', params: { channelId: props.channelId } })
}
</script>

<template>
  <span
    class="channel-line"
    :class="{ linked }"
    :role="linked ? 'link' : undefined"
    :tabindex="linked ? 0 : undefined"
    :title="linked ? name : undefined"
    @click="open"
    @keydown.enter="open"
  >
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

.channel-line.linked {
  justify-self: start;
  max-inline-size: 100%;
  inline-size: fit-content;
  cursor: pointer;
}

.channel-line.linked:hover .name {
  text-decoration: underline;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
