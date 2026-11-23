<script setup lang="ts">
import { onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { timeAgo } from '@fraitube/subscriptions'
import { entryWithPosition, videoThumbnail, watchProgress, type HistoryEntry } from '../../../shared/history'
import { usePaging } from '../../components/paging'
import VideoCard from '../../components/VideoCard.vue'
import VideoGrid from '../../components/VideoGrid.vue'
import { playInNewWindowItem } from '../../components/videoMenu'
import ConfirmClearDialog from '../../components/ConfirmClearDialog.vue'
import { historyClearWarning } from './clearHistory'
import { useWatchedMenuItem } from './progress'

const { watchedItem } = useWatchedMenuItem()
const entries = ref<HistoryEntry[]>([])
const loaded = ref(false)
const error = ref('')
const now = ref(Date.now())
const { shown, hasMore, showMore } = usePaging(() => entries.value)

function reportError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

async function reload(): Promise<void> {
  try {
    entries.value = await window.fraitube.listHistory()
    now.value = Date.now()
    error.value = ''
  } catch (cause) {
    reportError(cause)
  } finally {
    loaded.value = true
  }
}

function remove(videoId: string): void {
  window.fraitube.removeHistory(videoId).catch(reportError)
}

const clearDialog = useTemplateRef<InstanceType<typeof ConfirmClearDialog>>('clearDialog')

/** Runs only after the warning, once CLEAR was typed. */
function clearAll(): void {
  window.fraitube.clearHistory().catch(reportError)
}

const FORMAT_NAMES = { freetube: 'FreeTube', newpipe: 'NewPipe' } as const
const importing = ref(false)
const message = ref('')

function videos(count: number): string {
  return `${count} video${count === 1 ? '' : 's'}`
}

async function importFile(): Promise<void> {
  importing.value = true
  message.value = ''
  error.value = ''
  try {
    const summary = await window.fraitube.importHistory()
    if (summary) {
      message.value = `${FORMAT_NAMES[summary.format]} file: ${videos(summary.total)}, ${summary.added} added, ` +
        `${summary.updated} updated, ${summary.alreadyInHistory} already in history.`
    }
  } catch (cause) {
    reportError(cause)
  } finally {
    importing.value = false
  }
}

// The list follows changes made in any window, and the "ago" texts stay current.
const stopListening = window.fraitube.onHistoryChanged(() => {
  void reload()
})
const stopPositions = window.fraitube.onHistoryPositionSaved((videoId, positionSeconds) => {
  const index = entries.value.findIndex((entry) => entry.videoId === videoId)
  const entry = entryWithPosition(entries.value[index], positionSeconds)
  if (entry) {
    entries.value = entries.value.map((known, at) => (at === index ? entry : known))
  }
})
const clock = setInterval(() => {
  now.value = Date.now()
}, 60_000)
onBeforeUnmount(() => {
  stopListening()
  stopPositions()
  clearInterval(clock)
})

void reload()
</script>

<template>
  <div class="history-page">
    <header class="header">
      <h1>History</h1>
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
        :disabled="entries.length === 0"
        @click="clearDialog?.open()"
      >
        Clear history
      </button>
    </header>
    <ConfirmClearDialog
      ref="clearDialog"
      title="Clear the whole history?"
      :warning="historyClearWarning(entries.length)"
      clear-label="Clear history"
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
      v-if="loaded && entries.length === 0"
      class="meta"
    >
      No videos watched yet.
    </p>

    <VideoGrid
      :has-more="hasMore"
      @more="showMore"
    >
      <li
        v-for="entry in shown"
        :key="entry.videoId"
      >
        <VideoCard
          :video-id="entry.videoId"
          :title="entry.title || entry.videoId"
          :thumbnail="videoThumbnail(entry.videoId)"
          :progress="watchProgress(entry, 0)"
          :channel-id="entry.channelId"
          :channel-name="entry.channelName"
          :channel-avatar="entry.channelAvatar"
          :details="[`Watched ${timeAgo(entry.watchedAt, now)}`]"
          :menu-items="[playInNewWindowItem(entry.videoId), watchedItem(entry)]"
        >
          <template #actions>
            <button
              type="button"
              class="remove"
              :aria-label="`Remove ${entry.title || entry.videoId} from history`"
              @click="remove(entry.videoId)"
            >
              Remove
            </button>
          </template>
        </VideoCard>
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
  cursor: default;
}

.meta {
  opacity: 0.75;
  font-size: 0.9rem;
}

.remove {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.remove:hover {
  background: var(--color-hover);
}

.error {
  color: #ff6b6b;
}
</style>
