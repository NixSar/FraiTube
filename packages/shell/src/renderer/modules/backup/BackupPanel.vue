<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { timeAgo } from '@fraitube/subscriptions'
import type { BackupStatus } from '../../../shared/backupSettings'

const status = ref<BackupStatus>()
const error = ref('')
const now = ref(Date.now())

function reportError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

function createBackup(): void {
  error.value = ''
  window.fraitube.createBackup().then((result) => {
    status.value = result
  }, reportError)
}

function restoreBackup(): void {
  error.value = ''
  window.fraitube.restoreBackup().then((result) => {
    status.value = result
  }, reportError)
}

const stopListening = window.fraitube.onBackupStatusChanged((next) => {
  status.value = next
  now.value = Date.now()
})
const clock = setInterval(() => {
  now.value = Date.now()
}, 30_000)
onBeforeUnmount(() => {
  stopListening()
  clearInterval(clock)
})

window.fraitube.getBackupStatus().then((result) => {
  status.value = result
}, reportError)
</script>

<template>
  <div class="panel">
    <p class="hint">
      A backup holds subscriptions, history and settings in one 7z file. Restoring one replaces them and restarts FraiTube.
    </p>
    <div class="buttons">
      <button
        type="button"
        :disabled="!status || status.working"
        @click="createBackup"
      >
        Create backup
      </button>
      <button
        type="button"
        :disabled="!status || status.working"
        @click="restoreBackup"
      >
        Restore backup
      </button>
    </div>
    <dl
      v-if="status?.lastAction && status.at"
      class="status"
    >
      <dt>{{ status.lastAction === 'backup' ? 'Last backup' : 'Last restore' }}</dt>
      <dd>{{ status.error ? 'Failed' : 'Done' }}, {{ timeAgo(status.at, now) }}</dd>
      <template v-if="status.file && !status.error">
        <dt>File</dt>
        <dd class="path">
          {{ status.file }}
        </dd>
      </template>
    </dl>
    <p
      v-if="status?.working"
      class="hint"
    >
      Working
    </p>
    <p
      v-if="status?.error"
      class="error"
    >
      {{ status.error }}
    </p>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.panel {
  padding-block: 8px;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-block: 8px;
}

button {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.status {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
}

dt {
  opacity: 0.75;
}

dd {
  margin: 0;
}

.path {
  overflow-wrap: anywhere;
  opacity: 0.85;
}

.hint {
  margin: 0;
  opacity: 0.75;
  font-size: 0.9rem;
}

.error {
  color: #ff6b6b;
}

/* Phones: buttons wrap and the status list is one column. */
@media (width < 600px) {
  .buttons {
    flex-wrap: wrap;
  }

  .status {
    grid-template-columns: 1fr;
    gap: 0;
  }

  dd {
    margin-block-end: 6px;
  }
}
</style>
