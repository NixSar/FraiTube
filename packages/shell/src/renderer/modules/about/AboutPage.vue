<script setup lang="ts">
import { ref } from 'vue'
import logo from '../../../../build/icon.png'
import { ABOUT, CREDITS } from './about'
import UpdateDownload from '../../components/UpdateDownload.vue'
import { useUpdates } from '../../updates'

/** The app's name and version, what it is, its license and links, where its data is kept, and the projects it is built on. */
const version = ref('')
const dataFolder = ref('')

window.fraitube.getAppInfo().then((info) => {
  version.value = info.version
  dataFolder.value = info.dataFolder
}, () => {
  // The version and folder stay blank; the rest of the page still shows.
})

function openFolder(): void {
  window.fraitube.openDataFolder()
}

// The page checks for updates each time it opens.
const { state: update, check } = useUpdates()
check()
</script>

<template>
  <div class="about-page">
    <h1 class="title">
      <img
        class="logo"
        :src="logo"
        alt=""
      >
      <span>FraiTube</span>
      <span
        v-if="version"
        class="version"
      >{{ version }}</span>
    </h1>
    <p>{{ ABOUT.description }}</p>

    <h2>Updates</h2>
    <div
      class="updates"
      aria-live="polite"
    >
      <span v-if="update.status === 'checking' || update.status === 'idle'">Checking for updates</span>
      <span v-else-if="update.status === 'current'">You have the latest version.</span>
      <template v-else-if="update.status === 'available' && update.latest">
        <span>FraiTube {{ update.latest.version }} is available.</span>
        <UpdateDownload />
        <a
          :href="update.latest.pageUrl"
          target="_blank"
          rel="noreferrer"
        >What's new</a>
      </template>
      <span
        v-else-if="update.status === 'failed'"
        class="error"
      >Updates could not be checked: {{ update.error }}</span>
      <button
        type="button"
        class="secondary"
        :disabled="update.status === 'checking'"
        @click="check"
      >
        Check again
      </button>
    </div>

    <h2>License</h2>
    <p>
      FraiTube is free software under the
      <a
        :href="ABOUT.licenseUrl"
        target="_blank"
        rel="noreferrer"
      >{{ ABOUT.license }}</a> license.
    </p>

    <h2>Source code and issues</h2>
    <ul>
      <li>
        <a
          :href="ABOUT.repositoryUrl"
          target="_blank"
          rel="noreferrer"
        >FraiTube on GitHub</a>
      </li>
      <li>
        <a
          :href="ABOUT.issuesUrl"
          target="_blank"
          rel="noreferrer"
        >Report a problem or ask for a feature</a>
      </li>
    </ul>

    <h2>Your data</h2>
    <p>Subscriptions, history, favorites and settings are kept on this computer, in:</p>
    <p class="folder">
      <code>{{ dataFolder }}</code>
      <button
        type="button"
        class="action"
        @click="openFolder"
      >
        Open folder
      </button>
    </p>

    <h2>Built with</h2>
    <ul>
      <li
        v-for="credit in CREDITS"
        :key="credit.name"
      >
        <a
          :href="credit.url"
          target="_blank"
          rel="noreferrer"
        >{{ credit.name }}</a>, {{ credit.does }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.about-page {
  max-inline-size: 800px;
}

.title {
  display: flex;
  align-items: center;
  gap: 0.4em;
}

.logo {
  flex: none;
  inline-size: 1.4em;
  block-size: 1.4em;
}

.version {
  align-self: last baseline;
  font-size: 1rem;
  font-weight: normal;
  opacity: 0.7;
}

h2 {
  margin-block: 24px 8px;
  font-size: 1.05rem;
}

p,
ul {
  margin-block: 0 8px;
  line-height: 1.5;
}

a {
  color: var(--color-accent);
}

.folder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

code {
  overflow-wrap: anywhere;
}

.updates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-block-end: 8px;
}

.secondary {
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.secondary:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  color: #ff6b6b;
}

.action {
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  cursor: pointer;
}
</style>
