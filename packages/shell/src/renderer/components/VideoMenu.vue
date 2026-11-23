<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { VIDEO_MENU_WIDTH, videoMenuPosition, type VideoMenuItem } from './videoMenu'

/**
 * A video's ⋮ button and the menu it opens. The card it belongs to opens the same menu on right-click,
 * which a long press on a touch screen also sends, through `openAt`.
 */
const props = defineProps<{ items: VideoMenuItem[] }>()

const position = ref<{ left: number; top: number }>()
const button = useTemplateRef<HTMLButtonElement>('button')
const menu = useTemplateRef<HTMLDivElement>('menu')

function show(point: { x: number; y: number }): void {
  position.value = videoMenuPosition(point, props.items.length, { width: window.innerWidth, height: window.innerHeight })
  addCloseListeners()
  void nextTick(() => menu.value?.querySelector('button')?.focus())
}

/** Opens the menu where the card was right-clicked or long-pressed. */
function openAt(event: MouseEvent): void {
  event.preventDefault()
  // A menu opened from the keyboard has no pointer position, so it shows under the button.
  if (event.clientX > 0 || event.clientY > 0) {
    show({ x: event.clientX, y: event.clientY })
  } else {
    openFromButton()
  }
}

function openFromButton(): void {
  const rect = button.value?.getBoundingClientRect()
  if (rect) {
    show({ x: rect.right - VIDEO_MENU_WIDTH, y: rect.bottom })
  }
}

function toggle(): void {
  if (position.value) {
    close()
  } else {
    openFromButton()
  }
}

function close(): void {
  position.value = undefined
  removeCloseListeners()
}

function choose(item: VideoMenuItem): void {
  close()
  item.run()
}

function onPointerDown(event: PointerEvent): void {
  const inside = event.target instanceof Node && (menu.value?.contains(event.target) || button.value?.contains(event.target))
  if (!inside) {
    close()
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close()
  }
}

function addCloseListeners(): void {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
}

function removeCloseListeners(): void {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
}

onBeforeUnmount(removeCloseListeners)

defineExpose({ openAt })
</script>

<template>
  <button
    ref="button"
    type="button"
    class="more"
    aria-label="More"
    aria-haspopup="menu"
    :aria-expanded="position !== undefined"
    @click.prevent.stop="toggle"
  >
    ⋮
  </button>
  <Teleport to="body">
    <div
      v-if="position"
      ref="menu"
      class="menu"
      role="menu"
      :style="{ left: `${position.left}px`, top: `${position.top}px`, inlineSize: `${VIDEO_MENU_WIDTH}px` }"
    >
      <button
        v-for="item in items"
        :key="item.label"
        type="button"
        role="menuitem"
        @click="choose(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.more {
  display: grid;
  place-items: center;
  inline-size: 28px;
  block-size: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.more:hover,
.more:focus-visible,
.more[aria-expanded="true"] {
  background: var(--color-hover);
  outline: none;
}

.menu {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
}

.menu button {
  display: block;
  inline-size: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: 0.875rem;
  text-align: start;
  cursor: pointer;
}

.menu button:hover,
.menu button:focus-visible {
  background: var(--color-hover);
  outline: none;
}
</style>
