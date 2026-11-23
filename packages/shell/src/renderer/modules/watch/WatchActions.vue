<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { formatClock } from '../../../shared/history'
import { controls, reloadVideo } from './nowPlaying'
import { embedLink, watchLink } from './shareLinks'

const props = defineProps<{ videoId: string }>()

/** How long a Copy action says "Copied", in milliseconds. */
const COPIED_MS = 1500

type LinkKind = 'watch' | 'embed'

/** The menu's rows: the link each one shares and its name. */
const rows: { kind: LinkKind; name: string }[] = [
  { kind: 'watch', name: 'Link' },
  { kind: 'embed', name: 'Embed' }
]

const open = ref(false)
const withStart = ref(false)
/** The whole second the video was at when the menu opened, which the links start at when chosen. */
const startAt = ref(0)
/** The row whose Copy action says "Copied" or that copying failed, and what it says. */
const copyNotice = ref<{ kind: LinkKind; text: string }>()
let copyNoticeTimer: ReturnType<typeof setTimeout> | undefined
const share = useTemplateRef<HTMLDivElement>('share')
const menu = useTemplateRef<HTMLDivElement>('menu')

function link(kind: LinkKind): string {
  const seconds = withStart.value ? startAt.value : undefined
  return kind === 'watch' ? watchLink(props.videoId, seconds) : embedLink(props.videoId, seconds)
}

async function copy(kind: LinkKind): Promise<void> {
  let text = 'Copied'
  try {
    await navigator.clipboard.writeText(link(kind))
  } catch {
    text = 'Could not copy'
  }
  copyNotice.value = { kind, text }
  clearTimeout(copyNoticeTimer)
  copyNoticeTimer = setTimeout(() => {
    copyNotice.value = undefined
  }, COPIED_MS)
}

/** Opens the link in the system browser; the app passes every outside link there. */
function openLink(kind: LinkKind): void {
  window.open(link(kind))
  closeMenu()
}

function copyLabel(kind: LinkKind): string {
  return copyNotice.value?.kind === kind ? copyNotice.value.text : 'Copy'
}

function toggleMenu(): void {
  if (open.value) {
    closeMenu()
    return
  }
  startAt.value = Math.floor(controls.value?.playheadSeconds() ?? 0)
  open.value = true
  addCloseListeners()
  void nextTick(() => menu.value?.querySelector('button')?.focus())
}

function closeMenu(): void {
  open.value = false
  removeCloseListeners()
}

function onPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node && share.value?.contains(event.target))) {
    closeMenu()
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

function addCloseListeners(): void {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', closeMenu)
}

function removeCloseListeners(): void {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', closeMenu)
}

onBeforeUnmount(() => {
  removeCloseListeners()
  clearTimeout(copyNoticeTimer)
})
</script>

<template>
  <button
    type="button"
    class="action"
    @click="reloadVideo"
  >
    Reload
  </button>
  <div
    ref="share"
    class="share"
  >
    <button
      type="button"
      class="action"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggleMenu"
    >
      Share
    </button>
    <div
      v-if="open"
      ref="menu"
      class="menu"
      role="menu"
    >
      <div
        v-for="row in rows"
        :key="row.kind"
        class="row"
      >
        <span class="name">{{ row.name }}</span>
        <button
          type="button"
          role="menuitem"
          @click="copy(row.kind)"
        >
          {{ copyLabel(row.kind) }}
        </button>
        <button
          type="button"
          role="menuitem"
          @click="openLink(row.kind)"
        >
          Open
        </button>
      </div>
      <label class="start">
        <input
          v-model="withStart"
          type="checkbox"
        >
        Start at {{ formatClock(startAt) }}
      </label>
    </div>
  </div>
</template>

<style scoped>
.action {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.action:hover {
  background: var(--color-hover);
}

.share {
  position: relative;
}

.menu {
  position: absolute;
  inset-block-start: calc(100% + 4px);
  inset-inline-end: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  min-inline-size: 200px;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
  font-size: 0.875rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 10px;
  border-radius: 4px;
}

.row:hover {
  background: var(--color-hover);
}

.name {
  flex: 1;
}

.row button {
  padding: 4px 6px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-accent);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.row button:hover,
.row button:focus-visible {
  text-decoration: underline;
  outline: none;
}

.start {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  white-space: nowrap;
  cursor: pointer;
}

.start input {
  margin: 0;
  accent-color: var(--color-accent);
}
</style>
