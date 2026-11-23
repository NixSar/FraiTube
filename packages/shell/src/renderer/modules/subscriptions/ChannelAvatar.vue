<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ name: string; avatar: string; size?: number }>()

const failed = ref(false)
const letter = computed(() => props.name.trim().charAt(0).toUpperCase() || '?')
const style = computed(() => ({ inlineSize: `${props.size ?? 48}px`, blockSize: `${props.size ?? 48}px`, fontSize: `${(props.size ?? 48) / 2.2}px` }))
</script>

<template>
  <img
    v-if="avatar && !failed"
    class="avatar"
    :style="style"
    :src="avatar"
    alt=""
    loading="lazy"
    @error="failed = true"
  >
  <span
    v-else
    class="avatar letter"
    :style="style"
    aria-hidden="true"
  >{{ letter }}</span>
</template>

<style scoped>
.avatar {
  flex: none;
  border-radius: 50%;
  object-fit: cover;
}

.letter {
  display: grid;
  place-items: center;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 600;
}
</style>
