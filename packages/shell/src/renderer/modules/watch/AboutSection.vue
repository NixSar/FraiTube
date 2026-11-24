<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { isChannelId } from '@fraitube/subscriptions'
import type { VideoAbout } from '@fraitube/youtube/types'
import { cardDetails } from '../../components/videoCard'
import ChannelAvatar from '../subscriptions/ChannelAvatar.vue'
import SubscribeButton from '../subscriptions/SubscribeButton.vue'
import { useSubscriptions } from '../subscriptions/store'
import RichText from './RichText.vue'

const props = defineProps<{ about: VideoAbout; channelId: string; channelName: string }>()
const emit = defineEmits<{ seek: [seconds: number] }>()

const expanded = ref(false)
const { avatarOf } = useSubscriptions()

const stats = computed(() => {
  const views = expanded.value ? props.about.exactViewsText || props.about.viewsText : props.about.viewsText
  const date = expanded.value ? props.about.publishDateText || props.about.relativeDateText : props.about.relativeDateText || props.about.publishDateText
  return cardDetails([views, date])
})
</script>

<template>
  <section class="about">
    <div class="owner">
      <div class="channel">
        <component
          :is="isChannelId(channelId) ? RouterLink : 'div'"
          class="channel-link"
          :to="isChannelId(channelId) ? { name: 'channel', params: { channelId } } : undefined"
        >
          <ChannelAvatar
            :name="channelName || channelId"
            :avatar="about.channelIcon || avatarOf(channelId)"
            :size="40"
          />
          <div
            class="names"
            :title="channelName"
          >
            <span class="name">{{ channelName }}</span>
            <span
              v-if="about.subscribersText"
              class="subscribers"
            >{{ about.subscribersText }}</span>
          </div>
        </component>
        <SubscribeButton
          v-if="channelId"
          :channel="{ id: channelId, name: channelName || channelId, avatar: about.channelIcon }"
        />
      </div>
      <div class="end">
        <span
          v-if="about.likesText"
          class="likes"
        >{{ about.likesText }} likes</span>
        <slot name="actions" />
      </div>
    </div>
    <div class="description">
      <p
        v-if="stats"
        class="stats"
      >
        {{ stats }}
      </p>
      <p
        v-if="about.description.length > 0"
        class="text"
        :class="{ collapsed: !expanded }"
      >
        <RichText
          :parts="about.description"
          @seek="emit('seek', $event)"
        />
      </p>
      <button
        type="button"
        class="toggle"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Show less' : 'Show more' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/*
 * The channel and the actions share a line while both fit, the actions at its end. When they do not,
 * the actions move together to a line of their own under the channel, starting at its left edge.
 */
.about {
  container-type: inline-size;
}

.owner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.channel {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 12px;
  min-inline-size: 0;
}

.channel > :deep(*) {
  flex: none;
}

.channel > .channel-link {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 12px;
  min-inline-size: 0;
  color: var(--color-text);
  text-decoration: none;
}

.channel-link > :deep(*) {
  flex: none;
}

.channel-link > .names {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-inline-size: 0;
}

a.channel-link:hover .name {
  text-decoration: underline;
}

.name,
.subscribers {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-weight: 600;
}

.subscribers {
  font-size: 0.85rem;
  opacity: 0.75;
}

.end {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

.likes {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  white-space: nowrap;
}

/* Very narrow: tighter buttons, so likes, Reload and Share still fit on one line. */
@container (width < 400px) {
  .end {
    gap: 6px;
  }

  .likes,
  .end :deep(.action) {
    padding-inline: 10px;
  }
}

.description {
  margin-block-start: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-surface);
}

.stats {
  margin: 0 0 6px;
  font-weight: 600;
}

.text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text.collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.toggle {
  margin-block-start: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
