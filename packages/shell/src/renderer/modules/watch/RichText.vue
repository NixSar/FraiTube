<script setup lang="ts">
import type { DescriptionPart } from '@fraitube/youtube/types'

defineProps<{ parts: DescriptionPart[] }>()
const emit = defineEmits<{ seek: [seconds: number] }>()
</script>

<template>
  <template
    v-for="(part, index) in parts"
    :key="index"
  >
    <a
      v-if="part.kind === 'link'"
      class="link"
      :href="part.url"
      target="_blank"
      rel="noreferrer"
    >{{ part.text }}</a>
    <button
      v-else-if="part.kind === 'time'"
      type="button"
      class="link time"
      @click="emit('seek', part.seconds)"
    >
      {{ part.text }}
    </button>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>

<style scoped>
.link {
  color: var(--color-accent);
}

.time {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
}
</style>
