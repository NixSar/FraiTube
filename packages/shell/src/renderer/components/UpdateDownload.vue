<script setup lang="ts">
import { computed } from 'vue'
import { downloadPercent } from '../../shared/updates'
import { useUpdates } from '../updates'

/** The download of a newer release's installer: the button, the progress, and what to do with the file. */
const { state, download, actionError, startDownload, install } = useUpdates()
const version = computed(() => state.value.latest?.version ?? '')
const current = computed(() => (download.value.version === version.value ? download.value : undefined))
</script>

<template>
  <span class="update-download">
    <template v-if="current?.status === 'downloading'">
      <span
        class="progress"
        role="status"
      >Downloading {{ downloadPercent(current) }}%</span>
    </template>
    <template v-else-if="current?.status === 'done'">
      <button
        type="button"
        class="action"
        @click="install"
      >
        {{ current.action === 'install' ? 'Install now' : 'Show in folder' }}
      </button>
    </template>
    <button
      v-else-if="state.latest?.file"
      type="button"
      class="action"
      @click="startDownload"
    >
      Download
    </button>
    <span
      v-if="current?.status === 'failed'"
      class="error"
    >{{ current.error }}</span>
    <span
      v-if="actionError"
      class="error"
    >{{ actionError }}</span>
  </span>
</template>

<style scoped>
.update-download {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.action {
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  cursor: pointer;
}

.progress {
  font-variant-numeric: tabular-nums;
}

.error {
  color: #ff6b6b;
}
</style>
