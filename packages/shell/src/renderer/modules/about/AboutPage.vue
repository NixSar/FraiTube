<script setup lang="ts">
import { ref } from 'vue'
import { ABOUT, CREDITS } from './about'

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
</script>

<template>
  <div class="about-page">
    <h1>
      FraiTube <span
        v-if="version"
        class="version"
      >{{ version }}</span>
    </h1>
    <p>{{ ABOUT.description }}</p>

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

.version {
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
