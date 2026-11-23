<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName, type IconPath } from './icons'

/** One of the app's icons, in the current text color; decoration only, so the button or link around it carries the name. */
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 })
const paths = computed<IconPath[]>(() => ICONS[props.name])
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    :width="props.size"
    :height="props.size"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(path, index) in paths"
      :key="index"
      :d="path.d"
      :fill="path.fill ? 'currentColor' : 'none'"
      :stroke="path.fill ? 'none' : 'currentColor'"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: none;
}
</style>
