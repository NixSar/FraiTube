<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import ConfirmClearDialog from '../../components/ConfirmClearDialog.vue'
import ChannelAvatar from './ChannelAvatar.vue'
import { subscriptionsClearWarning } from './clearSubscriptions'
import { unsubscribe, useSubscriptions } from './store'

const { subscriptions } = useSubscriptions()
const message = ref('')
const error = ref('')
const importing = ref(false)

const FORMAT_NAMES = { freetube: 'FreeTube', newpipe: 'NewPipe' } as const

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

async function importFile(): Promise<void> {
  importing.value = true
  message.value = ''
  error.value = ''
  try {
    const summary = await window.fraitube.importSubscriptions()
    if (summary) {
      message.value = `${FORMAT_NAMES[summary.format]} file: ${plural(summary.added, 'channel')} added, ` +
        `${summary.alreadySubscribed} already subscribed.`
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    importing.value = false
  }
}

const clearDialog = useTemplateRef<InstanceType<typeof ConfirmClearDialog>>('clearDialog')

/** Runs only after the warning, once CLEAR was typed. */
async function clearAll(): Promise<void> {
  message.value = ''
  error.value = ''
  try {
    await window.fraitube.clearSubscriptions()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function remove(channelId: string): Promise<void> {
  error.value = ''
  try {
    await unsubscribe(channelId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
</script>

<template>
  <div class="channels-page">
    <header class="header">
      <h1>Subscriptions</h1>
      <div class="actions">
        <button
          type="button"
          class="action"
          :disabled="importing"
          @click="importFile"
        >
          Import from FreeTube or NewPipe
        </button>
        <button
          type="button"
          class="action"
          :disabled="subscriptions.length === 0"
          @click="clearDialog?.open()"
        >
          Clear subscriptions
        </button>
      </div>
    </header>
    <ConfirmClearDialog
      ref="clearDialog"
      title="Clear all subscriptions?"
      :warning="subscriptionsClearWarning(subscriptions.length)"
      clear-label="Clear subscriptions"
      @clear="clearAll"
    />
    <p
      v-if="message"
      class="message"
    >
      {{ message }}
    </p>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p
      v-if="subscriptions.length === 0"
      class="meta"
    >
      No subscriptions yet.
    </p>
    <ul class="list">
      <li
        v-for="channel in subscriptions"
        :key="channel.id"
        class="channel"
      >
        <RouterLink
          class="channel-link"
          :to="{ name: 'channel', params: { channelId: channel.id } }"
        >
          <ChannelAvatar
            :name="channel.name"
            :avatar="channel.avatar"
          />
          <span class="name">{{ channel.name }}</span>
        </RouterLink>
        <button
          type="button"
          class="unsubscribe"
          @click="remove(channel.id)"
        >
          Unsubscribe
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.channels-page {
  max-inline-size: 800px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.channel {
  display: flex;
  align-items: center;
  gap: 12px 16px;
  padding-block: 8px;
  border-block-end: 1px solid var(--color-border);
}

.channel-link {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px 16px;
  min-inline-size: 0;
  color: var(--color-text);
  text-decoration: none;
}

.channel-link:hover .name {
  text-decoration: underline;
}

.name {
  min-inline-size: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.unsubscribe {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.meta {
  opacity: 0.75;
}

.error {
  color: #ff6b6b;
}
</style>
