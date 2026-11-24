<script setup lang="ts">
import { computed } from 'vue'
import { SettingKey } from '../../shared/settings'
import { showsBanner } from '../../shared/updates'
import { setSetting, settings } from '../settings'
import { useUpdates } from '../updates'
import UpdateDownload from './UpdateDownload.vue'

/** The banner above the top bar while a newer version is out, until it is dismissed for that version. */
const { state } = useUpdates()
const shown = computed(() => showsBanner(state.value, settings[SettingKey.dismissedUpdate]))

function dismiss(): void {
  const version = state.value.latest?.version
  if (version) {
    void setSetting(SettingKey.dismissedUpdate, version)
  }
}
</script>

<template>
  <div
    v-if="shown && state.latest"
    class="update-banner"
    role="status"
  >
    <span class="text">FraiTube {{ state.latest.version }} is available.</span>
    <UpdateDownload />
    <a
      :href="state.latest.pageUrl"
      target="_blank"
      rel="noreferrer"
    >What's new</a>
    <button
      type="button"
      class="dismiss"
      aria-label="Dismiss this update"
      title="Dismiss until a newer version"
      @click="dismiss"
    >
      &times;
    </button>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 6px 8px 6px 16px;
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.text {
  font-weight: bold;
}

a {
  color: inherit;
}

/* The download button stands out against the accent colored bar. */
.update-banner :deep(.action) {
  background: var(--color-on-accent);
  color: var(--color-accent);
}

.update-banner :deep(.error) {
  color: inherit;
  font-style: italic;
}

.dismiss {
  margin-inline-start: auto;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 20px;
  line-height: 1.2;
  cursor: pointer;
}

.dismiss:hover {
  background: rgb(0 0 0 / 15%);
}

@media (width < 600px) {
  .update-banner {
    padding: 4px 4px 4px 8px;
    font-size: 14px;
  }
}
</style>
