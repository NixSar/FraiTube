<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Channel } from '@fraitube/subscriptions/types'
import { subscribe, unsubscribe, useSubscriptions } from './store'

const props = defineProps<{ channel: Channel }>()

const { isSubscribed } = useSubscriptions()
const busy = ref(false)
const error = ref('')
const subscribed = computed(() => isSubscribed(props.channel.id))

async function toggle(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await (subscribed.value ? unsubscribe(props.channel.id) : subscribe(props.channel))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="subscribe"
    :class="{ subscribed }"
    :disabled="busy"
    :title="error || undefined"
    @click.prevent.stop="toggle"
  >
    {{ subscribed ? 'Unsubscribe' : 'Subscribe' }}
  </button>
</template>

<style scoped>
.subscribe {
  padding: 6px 14px;
  border: 1px solid var(--color-accent);
  border-radius: 16px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.subscribe.subscribed {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text);
}

.subscribe:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
