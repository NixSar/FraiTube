<script setup lang="ts">
import type { FraiTubeModule, NavItem } from '@fraitube/app-api'
import { computed, defineAsyncComponent, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { isShortsLink, videoIdFromLink } from '@fraitube/youtube/ids'
import { splitNav } from './sideNav'
import { newWindowPath, newWindowTitle } from './newWindow'
import { canSearch, historySteps, keyStep, mouseStep, type Step } from './backForward'
import { rememberScroll } from './scrollRestore'
import AppIcon from './components/AppIcon.vue'
import UpdateBanner from './components/UpdateBanner.vue'
import { isIconName } from './components/icons'
import { settings } from './settings'
import {
  matchingSearches,
  pickedIndex,
  searchEntries,
  searchEntryKey,
  SearchHistorySettingKey,
  type PastSearch,
  type SearchEntry
} from '../shared/searchHistory'
import { usePastSearches } from './modules/searchHistory/store'
import { createSuggester } from './searchSuggestions'
import { searchMemory, searchRuns } from './modules/search/searchMemory'

const props = defineProps<{
  nav: NavItem[]
  frames: NonNullable<FraiTubeModule['frame']>[]
  navPanels: NonNullable<FraiTubeModule['navPanel']>[]
}>()

/** The modules' parts of the frame, mounted once and kept on every page. */
const frameParts = props.frames.map((load) => defineAsyncComponent(load))
/** The modules' parts of the side column, under the navigation links. */
const navParts = props.navPanels.map((load) => defineAsyncComponent(load))
const navGroups = splitNav(props.nav)

const route = useRoute()
const router = useRouter()
const query = ref('')

/** Nothing shows until the first page is known, so a bare page never mounts the app's frame. */
const ready = ref(false)
void router.isReady().then(() => {
  ready.value = true
})
/** A bare page, such as the PiP window's, shows alone. */
const bare = computed(() => route.meta['bare'] === true)

/** Where this window can go back or forward to, known again after every page change. */
const steps = ref(historySteps(window.history.state))
const removeAfterEach = router.afterEach(() => {
  steps.value = historySteps(window.history.state)
})

function go(step: Step): void {
  if (!bare.value && steps.value[step]) {
    router.go(step === 'back' ? -1 : 1)
  }
}

/** Alt+Left and Alt+Right go back and forward. */
function onKeyDown(event: KeyboardEvent): void {
  const step = keyStep(event)
  if (step && !bare.value) {
    event.preventDefault()
    go(step)
  }
}

/** The mouse's side buttons go back and forward. */
function onMouseUp(event: MouseEvent): void {
  const step = mouseStep(event)
  if (step && !bare.value) {
    event.preventDefault()
    go(step)
  }
}

/** The part of the window that scrolls: a page reached by a step back or forward returns to its place in it. */
const content = useTemplateRef<HTMLElement>('content')
const forgetScroll = rememberScroll(router, () => content.value)

window.addEventListener('keydown', onKeyDown)
window.addEventListener('mouseup', onMouseUp)
onBeforeUnmount(() => {
  removeAfterEach()
  forgetScroll()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mouseup', onMouseUp)
})

// The search box shows the query of the search page being viewed.
watch(() => route.query['q'], (q) => {
  if (typeof q === 'string') {
    query.value = q
  }
}, { immediate: true })

const pastSearches = usePastSearches()
/** Whether the past searches and suggestions show under the search box, while it has the focus. */
const listOpen = ref(false)
/** The entry picked with the arrow keys, by its kind and text, so it stays picked while the list around it changes. */
const picked = ref<string>()

/** Whether YouTube is asked for suggestions while typing. While it is off, nothing typed leaves the app before a search. */
const suggestOn = computed(() =>
  settings[SearchHistorySettingKey.suggest] !== false && window.fraitube.getSearchSuggestions !== undefined)
/** The suggestions for the last typed text that has an answer. */
const suggestions = ref<string[]>([])
const suggester = createSuggester(
  (text) => window.fraitube.getSearchSuggestions?.(text) ?? Promise.resolve([]),
  (_text, answer) => {
    suggestions.value = answer
  }
)

function askSuggestions(): void {
  if (suggestOn.value) {
    suggester.type(query.value)
  }
}

function dropSuggestions(): void {
  suggester.stop()
  suggestions.value = []
}

watch(query, () => {
  if (listOpen.value) {
    askSuggestions()
  }
})
watch(suggestOn, (on) => {
  if (on) {
    if (listOpen.value) {
      askSuggestions()
    }
  } else {
    dropSuggestions()
  }
})
onBeforeUnmount(dropSuggestions)

const shownSearches = computed((): SearchEntry[] => {
  if (!listOpen.value) {
    return []
  }
  const remember = settings[SearchHistorySettingKey.remember] !== false
  const past = remember ? matchingSearches(pastSearches.value, query.value) : []
  const suggested = suggestOn.value && query.value.trim() ? suggestions.value : []
  return searchEntries(past, suggested, remember ? pastSearches.value : [])
})

/** The picked entry's place in the list, -1 for none. */
const highlighted = computed(() => pickedIndex(shownSearches.value, picked.value))
// An entry that leaves the list is no longer picked.
watch(highlighted, (index) => {
  if (index < 0) {
    picked.value = undefined
  }
})

function openList(): void {
  listOpen.value = true
  picked.value = undefined
  askSuggestions()
}

function closeList(): void {
  listOpen.value = false
  picked.value = undefined
  dropSuggestions()
}

/**
 * A YouTube video link opens the video, a Shorts link marked as a short; anything else is searched and
 * saved in the search history. A search always runs fresh: what was kept for its text is forgotten,
 * and a search that already shows runs again.
 */
function search(): void {
  closeList()
  const text = query.value.trim()
  if (!text) {
    return
  }
  const videoId = videoIdFromLink(text)
  if (videoId) {
    query.value = ''
    void router.push({ name: 'watch', params: { videoId }, query: isShortsLink(text) ? { short: '1' } : {} })
  } else {
    // When saving fails, the search still runs.
    window.fraitube.addSearch(text).catch(() => undefined)
    searchMemory.forget(text)
    const target = { name: 'search', query: { q: text } }
    if (router.resolve(target).fullPath === route.fullPath) {
      searchRuns.value++
    } else {
      void router.push(target)
    }
  }
}

/** Searches a past search or a suggestion, which then joins the search history. */
function searchEntry(entry: SearchEntry): void {
  query.value = entry.query
  search()
}

function removePastSearch(past: PastSearch): void {
  window.fraitube.removeSearch(past.query).catch(() => undefined)
}

/** The arrow keys move through the entries, Enter searches the picked one and Escape closes the list. */
function onSearchKey(event: KeyboardEvent): void {
  const count = shownSearches.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!listOpen.value) {
      openList()
      event.preventDefault()
      return
    }
    if (count > 0) {
      // Past the last entry or before the first, the typed text is back, with no entry picked.
      const next = highlighted.value + (event.key === 'ArrowDown' ? 1 : -1)
      const entry = shownSearches.value[next >= count ? -1 : next < -1 ? count - 1 : next]
      picked.value = entry && searchEntryKey(entry)
      event.preventDefault()
    }
  } else if (event.key === 'Enter') {
    const entry = shownSearches.value[highlighted.value]
    if (entry) {
      event.preventDefault()
      searchEntry(entry)
    } else if (!canSearch(query.value)) {
      // With nothing to search for, the form does not submit, so the list closes here.
      closeList()
    }
  } else if (event.key === 'Escape' && count > 0) {
    event.preventDefault()
    closeList()
  }
}

function openInNewWindow(to: RouteLocationRaw): void {
  window.fraitube.openWindow(router.resolve(to).fullPath)
}

/** Ctrl+click opens the link in a new window, a plain click navigates here. */
function onLinkClick(event: MouseEvent, to: RouteLocationRaw, navigate: (event: MouseEvent) => unknown): void {
  if (event.ctrlKey) {
    event.preventDefault()
    openInNewWindow(to)
    return
  }
  void navigate(event)
}

/** Middle click opens the link in a new window. */
function onLinkAuxClick(event: MouseEvent, to: RouteLocationRaw): void {
  if (event.button === 1) {
    event.preventDefault()
    openInNewWindow(to)
  }
}
</script>

<template>
  <RouterView v-if="ready && bare" />
  <div
    v-else-if="ready"
    class="layout"
  >
    <UpdateBanner class="banner" />
    <header class="top-bar">
      <div class="top-start">
        <div class="history-buttons">
          <button
            type="button"
            class="history-button"
            aria-label="Back"
            title="Back (Alt+Left)"
            :aria-disabled="!steps.back"
            @click="go('back')"
          >
            <AppIcon name="back" />
          </button>
          <button
            type="button"
            class="history-button"
            aria-label="Forward"
            title="Forward (Alt+Right)"
            :aria-disabled="!steps.forward"
            @click="go('forward')"
          >
            <AppIcon name="forward" />
          </button>
        </div>
        <span class="app-name">FraiTube</span>
      </div>
      <form
        class="search"
        role="search"
        @submit.prevent="search"
      >
        <input
          v-model="query"
          type="search"
          placeholder="Search"
          aria-label="Search YouTube"
          maxlength="200"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="past-searches"
          :aria-expanded="shownSearches.length > 0"
          :aria-activedescendant="highlighted >= 0 ? `past-search-${highlighted}` : undefined"
          @focus="openList"
          @click="listOpen || openList()"
          @input="openList"
          @blur="closeList"
          @keydown="onSearchKey"
        >
        <button
          type="submit"
          class="search-button"
          aria-label="Search"
          title="Search"
          :disabled="!canSearch(query)"
          @mousedown.prevent
        >
          <AppIcon
            name="search"
            :size="18"
          />
        </button>
        <ul
          v-show="shownSearches.length > 0"
          id="past-searches"
          class="past-searches"
          role="listbox"
          aria-label="Past and suggested searches"
        >
          <li
            v-for="(entry, index) in shownSearches"
            :id="`past-search-${index}`"
            :key="searchEntryKey(entry)"
            role="option"
            class="past-search"
            :class="{ highlighted: index === highlighted }"
            :aria-selected="index === highlighted"
            @mousedown.prevent
            @click="searchEntry(entry)"
          >
            <AppIcon
              :name="entry.kind === 'past' ? 'history' : 'search'"
              class="past-search-icon"
            />
            <span class="past-search-text">{{ entry.query }}</span>
            <button
              v-if="entry.kind === 'past'"
              type="button"
              class="past-search-remove"
              tabindex="-1"
              :aria-label="`Remove ${entry.query} from search history`"
              title="Remove from search history"
              @click.stop="removePastSearch(entry.past)"
            >
              &times;
            </button>
          </li>
        </ul>
      </form>
      <button
        type="button"
        class="new-window"
        :title="newWindowTitle(route.name)"
        aria-label="New window"
        @click="openInNewWindow(newWindowPath(route.name, route.fullPath))"
      >
        <span class="new-window-label">New window</span>
        <span
          class="new-window-icon"
          aria-hidden="true"
        >&#10697;</span>
      </button>
    </header>

    <nav class="side-nav">
      <template
        v-for="group in navGroups"
        :key="group.name"
      >
        <div
          class="nav-group"
          :class="`nav-${group.name}`"
        >
          <RouterLink
            v-for="item in group.items"
            :key="item.route"
            v-slot="{ href, navigate, isActive }"
            :to="{ name: item.route }"
            custom
          >
            <a
              :href="href"
              class="nav-link"
              :class="{ active: isActive }"
              :title="item.label"
              :aria-label="item.label"
              @click="onLinkClick($event, { name: item.route }, navigate)"
              @auxclick="onLinkAuxClick($event, { name: item.route })"
            >
              <AppIcon
                v-if="isIconName(item.icon)"
                :name="item.icon"
              />
              <span class="nav-label">{{ item.label }}</span>
            </a>
          </RouterLink>
        </div>
        <div
          v-if="group.name === 'top'"
          class="nav-panels"
        >
          <component
            :is="part"
            v-for="(part, index) in navParts"
            :key="index"
          />
        </div>
      </template>
    </nav>

    <main
      ref="content"
      class="content"
    >
      <RouterView />
    </main>
    <component
      :is="part"
      v-for="(part, index) in frameParts"
      :key="index"
    />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-areas:
    'banner banner'
    'top top'
    'nav content';
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto auto 1fr;
  block-size: 100vh;
}

.banner {
  grid-area: banner;
}

.top-bar {
  grid-area: top;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.search {
  position: relative;
  flex: 1;
  max-inline-size: 560px;
  margin-inline: 24px;
}

.past-searches {
  position: absolute;
  inset-inline: 0;
  inset-block-start: calc(100% + 4px);
  z-index: 20;
  margin: 0;
  padding: 4px 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  list-style: none;
  box-shadow: 0 4px 12px rgb(0 0 0 / 25%);
}

.past-search {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px 6px 12px;
  cursor: pointer;
}

.past-search:hover,
.past-search.highlighted {
  background: var(--color-hover);
}

.past-search-icon {
  flex: none;
  opacity: 0.6;
}

.past-search-text {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.past-search-remove {
  flex: none;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.2;
  opacity: 0.6;
  cursor: pointer;
}

.past-search-remove:hover {
  background: var(--color-border);
  opacity: 1;
}

.search input {
  inline-size: 100%;
  padding: 7px 40px 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
}

/* The search button sits at the end of the search field. */
.search-button {
  position: absolute;
  inset-block: 3px;
  inset-inline-end: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.search-button:hover:not(:disabled) {
  background: var(--color-hover);
}

.search-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.top-start {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
}

.history-buttons {
  display: flex;
  gap: 2px;
}

.history-button {
  display: flex;
  align-items: center;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.history-button:hover:not([aria-disabled='true']) {
  background: var(--color-hover);
}

/* A button with nowhere to go keeps the keyboard focus, greyed out. */
.history-button[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

.app-name {
  font-weight: bold;
  font-size: 18px;
}

.side-nav {
  grid-area: nav;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: var(--color-surface);
  border-inline-end: 1px solid var(--color-border);
  overflow-y: auto;
}

.nav-group {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
}

/* The modules' parts fill the space between the top and bottom links, and scroll inside when taller than it. */
.nav-panels {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

/* With no part shown, the bottom links follow the top ones at the same spacing. */
.nav-panels:empty {
  display: none;
}

.nav-link {
  display: flex;
  gap: 10px;
  align-items: center;
  min-inline-size: 0;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--color-text);
  text-decoration: none;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-link:hover {
  background: var(--color-hover);
}

.nav-link.active {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.content {
  grid-area: content;
  min-inline-size: 0;
  overflow-y: auto;
  padding: 16px;
}

.new-window-icon {
  display: none;
  font-size: 18px;
  line-height: 1;
}

/* Medium windows: a narrower side nav. */
@media (width <= 1000px) {
  .layout {
    grid-template-columns: 136px 1fr;
  }

  .side-nav {
    padding: 6px;
  }

  .nav-link {
    gap: 8px;
    padding: 7px 8px;
    font-size: 14px;
  }

  .search {
    margin-inline: 16px;
  }
}

/* Narrow windows and phones: the tabs move to a bar along the bottom. */
@media (width < 600px) {
  .layout {
    --frame-bottom: 52px;

    grid-template-areas:
      'banner'
      'top'
      'content'
      'nav';
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto;
  }

  .top-bar {
    gap: 8px;
    padding: 6px 8px;
  }

  .app-name {
    font-size: 16px;
  }

  .top-start {
    gap: 6px;
  }

  .history-button {
    padding: 2px;
  }

  .search {
    margin-inline: 0;
    min-inline-size: 0;
  }

  .new-window {
    padding: 4px 8px;
  }

  .new-window-label {
    display: none;
  }

  .new-window-icon {
    display: inline;
  }

  .side-nav {
    flex-direction: row;
    block-size: var(--frame-bottom);
    padding: 4px;
    border-inline-end: none;
    border-block-start: 1px solid var(--color-border);
    overflow: hidden;
  }

  /* Every tab shares the bar, top and bottom ones alike, as an icon named by its tooltip. */
  .nav-group {
    display: contents;
  }

  .nav-panels {
    display: none;
  }

  .nav-link {
    flex: 1;
    justify-content: center;
    padding: 4px;
  }

  .nav-label {
    display: none;
  }

  .content {
    padding: 8px;
  }
}
</style>
