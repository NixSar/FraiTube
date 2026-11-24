<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import ConfirmClearDialog from '../../components/ConfirmClearDialog.vue'
import { searchHistoryClearWarning } from './clearSearchHistory'
import { usePastSearches } from './store'

const searches = usePastSearches()
const error = ref('')
const clearDialog = useTemplateRef<InstanceType<typeof ConfirmClearDialog>>('clearDialog')

/** Runs only after the warning, once CLEAR was typed. */
function clearAll(): void {
  error.value = ''
  window.fraitube.clearSearchHistory().catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
}
</script>

<template>
  <div class="panel">
    <p class="hint">
      {{ searches.length === 1 ? '1 saved search' : `${searches.length} saved searches` }}
    </p>
    <button
      type="button"
      :disabled="searches.length === 0"
      @click="clearDialog?.open()"
    >
      Clear search history
    </button>
    <ConfirmClearDialog
      ref="clearDialog"
      title="Clear the whole search history?"
      :warning="searchHistoryClearWarning(searches.length)"
      clear-label="Clear search history"
      @clear="clearAll"
    />
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

button {
  margin-block: 8px;
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

.hint {
  margin: 0;
  opacity: 0.75;
  font-size: 0.9rem;
}

.error {
  color: #ff6b6b;
}
</style>
