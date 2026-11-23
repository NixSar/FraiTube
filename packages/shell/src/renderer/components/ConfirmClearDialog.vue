<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { CLEAR_WORD, confirmsClear } from './confirmClear'

/**
 * The warning shown before a whole list, such as the history or the subscriptions, is cleared. Its
 * clear button stays disabled until CLEAR is typed; the dialog opens with Cancel focused, Escape and
 * Enter cancel, and a click outside does nothing.
 */
const props = defineProps<{ title: string; warning: string; clearLabel: string }>()
const emit = defineEmits<{ clear: [] }>()
const titleId = useId()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton')
const typed = ref('')
const allowed = computed(() => confirmsClear(typed.value))

function open(): void {
  typed.value = ''
  dialog.value?.showModal()
  void nextTick(() => cancelButton.value?.focus())
}

function cancel(): void {
  dialog.value?.close()
}

function clear(): void {
  if (!allowed.value) {
    return
  }
  dialog.value?.close()
  emit('clear')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    cancel()
  }
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="clear-dialog"
    :aria-labelledby="titleId"
    @keydown="onKeyDown"
  >
    <h2 :id="titleId">
      {{ props.title }}
    </h2>
    <p class="warning">
      {{ props.warning }}
    </p>
    <label class="confirm">
      Type {{ CLEAR_WORD }} to allow clearing
      <input
        v-model="typed"
        type="text"
        autocomplete="off"
        spellcheck="false"
      >
    </label>
    <div class="buttons">
      <button
        ref="cancelButton"
        type="button"
        class="cancel"
        @click="cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="clear"
        :disabled="!allowed"
        @click="clear"
      >
        {{ props.clearLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.clear-dialog {
  box-sizing: border-box;
  inline-size: min(440px, calc(100vw - 32px));
  padding: 20px;
  border: 2px solid #ff6b6b;
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
}

.clear-dialog::backdrop {
  background: rgb(0 0 0 / 60%);
}

h2 {
  margin: 0 0 12px;
  color: #ff6b6b;
  font-size: 1.2rem;
}

.warning {
  margin: 0 0 16px;
  line-height: 1.4;
}

.confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}

.confirm input {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-block-start: 20px;
}

.buttons button {
  padding: 8px 16px;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.cancel:hover {
  background: var(--color-hover);
}

.clear {
  border: 0;
  background: #c62828;
  color: #ffffff;
}

.clear:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
