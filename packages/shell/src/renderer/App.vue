<script setup lang="ts">
import type { FraiTubeModule, NavItem } from '@fraitube/app-api'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { videoIdFromLink } from '@fraitube/youtube/ids'
import { splitNav } from './sideNav'
import AppIcon from './components/AppIcon.vue'
import { isIconName } from './components/icons'

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

// The search box shows the query of the search page being viewed.
watch(() => route.query['q'], (q) => {
  if (typeof q === 'string') {
    query.value = q
  }
}, { immediate: true })

/** A YouTube video link opens the video; anything else is searched. */
function search(): void {
  const text = query.value.trim()
  if (!text) {
    return
  }
  const videoId = videoIdFromLink(text)
  if (videoId) {
    query.value = ''
    void router.push({ name: 'watch', params: { videoId } })
  } else {
    void router.push({ name: 'search', query: { q: text } })
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
    <header class="top-bar">
      <span class="app-name">FraiTube</span>
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
        >
      </form>
      <button
        type="button"
        class="new-window"
        title="Open this page in a new window"
        aria-label="New window"
        @click="openInNewWindow(route.fullPath)"
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

    <main class="content">
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
    'top top'
    'nav content';
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto 1fr;
  block-size: 100vh;
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
  flex: 1;
  max-inline-size: 560px;
  margin-inline: 24px;
}

.search input {
  inline-size: 100%;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
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
      'top'
      'content'
      'nav';
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .top-bar {
    gap: 8px;
    padding: 6px 8px;
  }

  .app-name {
    font-size: 16px;
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
