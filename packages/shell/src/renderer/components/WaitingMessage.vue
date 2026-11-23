<script setup lang="ts">
import BusySpinner from './BusySpinner.vue'

/** A message shown while something is in progress: the turning ring centered just above its text. */
defineProps<{ text: string }>()
</script>

<template>
  <span class="waiting-message">
    <BusySpinner />
    <span>{{ text }}</span>
  </span>
</template>

<style scoped>
.waiting-message {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5em;
  text-align: center;
}
</style>
