<script setup lang="ts">
import { computed, defineAsyncComponent, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { SettingDefinition, SettingValue } from '@fraitube/app-api'
import { registryKey } from '../../registry'
import { setSetting, settings } from '../../settings'
import { searchSettings, settingsLayout } from './layout'

const registry = inject(registryKey)
const error = ref('')
const search = ref('')
/** The ID of the section being looked at, marked in the section list. */
const current = ref('')
const page = useTemplateRef<HTMLDivElement>('page')
let observer: IntersectionObserver | undefined

const panels = new Map(
  [...(registry?.settingsPanels ?? new Map())].map(([title, load]) => [title, defineAsyncComponent(load)])
)
const allSections = settingsLayout(registry?.settings ?? [], new Set(panels.keys()))
const sections = computed(() => searchSettings(allSections, search.value))

function save(definition: SettingDefinition, value: SettingValue): void {
  error.value = ''
  setSetting(definition.key, value).catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
}

function onInput(definition: SettingDefinition, event: Event): void {
  const input = event.target as HTMLInputElement | HTMLSelectElement
  if (definition.type === 'boolean') {
    save(definition, (input as HTMLInputElement).checked)
  } else if (definition.type === 'number') {
    const value = Number(input.value)
    if (input.value !== '' && Number.isFinite(value)) {
      save(definition, value)
    }
  } else {
    save(definition, input.value)
  }
}

/** The longest a jump to a section holds the marker, when the page tells of no scroll end. */
const JUMP_LIMIT_MS = 2000
/** True while the page scrolls to a clicked section; the marker stays on that section meanwhile. */
let jumping = false
let jumpTimer: ReturnType<typeof setTimeout> | undefined
let jumpScroller: HTMLElement | Window | undefined

function endJump(): void {
  jumping = false
  clearTimeout(jumpTimer)
  jumpScroller?.removeEventListener('scrollend', endJump)
  jumpScroller = undefined
}

/** Scrolls to a section and marks it; the sections passed on the way do not take the marker. */
function jumpTo(id: string): void {
  endJump()
  current.value = id
  const section = document.getElementById(id)
  if (!section) {
    return
  }
  jumping = true
  jumpScroller = (page.value && scrollParent(page.value)) ?? window
  jumpScroller.addEventListener('scrollend', endJump)
  jumpTimer = setTimeout(endJump, JUMP_LIMIT_MS)
  section.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onJumpChange(event: Event): void {
  jumpTo((event.target as HTMLSelectElement).value)
}

/** The element the page scrolls in. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
      return parent
    }
  }
  return null
}

/** Marks the topmost section in the upper part of the view as the one being looked at. */
function watchSections(): void {
  observer?.disconnect()
  const element = page.value
  if (!element) {
    return
  }
  const visible = new Set<string>()
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target.id)
      } else {
        visible.delete(entry.target.id)
      }
    }
    const first = sections.value.find((section) => visible.has(section.id))
    if (first && !jumping) {
      current.value = first.id
    }
  }, { root: scrollParent(element), rootMargin: '0px 0px -60% 0px' })
  for (const section of element.querySelectorAll('section[id]')) {
    observer.observe(section)
  }
}

watch(sections, async (shown) => {
  if (!shown.some((section) => section.id === current.value)) {
    current.value = shown[0]?.id ?? ''
  }
  await nextTick()
  watchSections()
})

onMounted(() => {
  current.value = sections.value[0]?.id ?? ''
  watchSections()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  endJump()
})
</script>

<template>
  <div
    ref="page"
    class="settings-page"
  >
    <header class="top">
      <h1>Settings</h1>
      <input
        v-model="search"
        type="search"
        class="search"
        placeholder="Search settings"
        aria-label="Search settings"
        maxlength="100"
      >
      <select
        class="jump"
        aria-label="Jump to section"
        :value="current"
        @change="onJumpChange"
      >
        <option
          v-for="section in sections"
          :key="section.id"
          :value="section.id"
        >
          {{ section.title }}
        </option>
      </select>
    </header>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <div class="columns">
      <nav
        class="section-list"
        aria-label="Settings sections"
      >
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ current: section.id === current }"
          @click="jumpTo(section.id)"
        >
          {{ section.title }}
        </button>
      </nav>
      <div class="sections">
        <p
          v-if="sections.length === 0"
          class="none"
        >
          No settings match "{{ search.trim() }}".
        </p>
        <section
          v-for="section in sections"
          :id="section.id"
          :key="section.id"
          class="section"
        >
          <h2>{{ section.title }}</h2>
          <label
            v-for="setting in section.settings"
            :key="setting.key"
            class="row"
          >
            <span>{{ setting.label }}</span>
            <select
              v-if="setting.type === 'choice'"
              :value="settings[setting.key]"
              @change="onInput(setting, $event)"
            >
              <option
                v-for="option in setting.options"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <input
              v-else-if="setting.type === 'color'"
              type="color"
              :value="settings[setting.key]"
              @input="onInput(setting, $event)"
            >
            <input
              v-else-if="setting.type === 'boolean'"
              type="checkbox"
              :checked="settings[setting.key] === true"
              @change="onInput(setting, $event)"
            >
            <input
              v-else-if="setting.type === 'text'"
              type="text"
              :maxlength="setting.maxLength"
              :value="settings[setting.key]"
              @change="onInput(setting, $event)"
            >
            <input
              v-else-if="setting.type === 'number'"
              type="number"
              :min="setting.min"
              :max="setting.max"
              :value="settings[setting.key]"
              @change="onInput(setting, $event)"
            >
          </label>
          <component
            :is="panels.get(section.title)"
            v-if="section.hasPanel"
          />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  container-type: inline-size;
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-block-end: 16px;
}

.top h1 {
  margin: 0;
}

.search {
  flex: 1;
  max-inline-size: 360px;
  min-inline-size: 0;
}

.jump {
  display: none;
}

.columns {
  display: grid;
  grid-template-columns: 160px minmax(0, 640px);
  gap: 24px;
  align-items: start;
}

.section-list {
  position: sticky;
  inset-block-start: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-list button {
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.section-list button:hover {
  background: var(--color-hover);
}

.section-list button.current {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.section {
  margin-block-end: 24px;
  padding: 8px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  scroll-margin-block-start: 8px;
}

h2 {
  font-size: 1.1rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-block: 8px;
}

select,
input[type='search'],
input[type='text'],
input[type='number'] {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
}

input[type='color'] {
  inline-size: 48px;
  block-size: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: none;
}

.none {
  opacity: 0.75;
}

.error {
  color: #ff6b6b;
}

/* Narrow pages: the section list becomes a "Jump to" menu at the top. */
@container (width < 640px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-list {
    display: none;
  }

  .jump {
    display: block;
  }

  .search {
    flex-basis: 100%;
    max-inline-size: none;
  }
}

/* Phones: each label sits above its control, and text, number and choice fields fill the width. */
@media (width < 600px) {
  .section {
    padding: 4px 12px;
  }

  .row {
    flex-wrap: wrap;
    gap: 6px 16px;
  }

  .row select,
  .row input[type='text'],
  .row input[type='number'] {
    flex: 1 1 100%;
    min-inline-size: 0;
  }
}
</style>
