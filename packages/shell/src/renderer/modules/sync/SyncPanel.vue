<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { timeAgo } from '@fraitube/subscriptions'
import { isSyncMode, SyncSettingKey, type SyncStatus } from '../../../shared/syncSettings'
import { setSetting, settings } from '../../settings'

const status = ref<SyncStatus>()
const error = ref('')
const now = ref(Date.now())
const remotes = ref<string[]>([])
const remotesError = ref('')
const loadingRemotes = ref(false)

const mode = computed(() => {
  const value = settings[SyncSettingKey.mode]
  return isSyncMode(value) ? value : 'off'
})
const folder = computed(() => String(settings[SyncSettingKey.folder] ?? ''))
const rcloneProgram = computed(() => String(settings[SyncSettingKey.rcloneProgram] ?? ''))
const remote = computed(() => String(settings[SyncSettingKey.rcloneRemote] ?? ''))
/** The saved remote stays in the list even while rclone does not report it. */
const remoteChoices = computed(() => (remote.value && !remotes.value.includes(remote.value) ? [remote.value, ...remotes.value] : remotes.value))

const webdavAddress = computed(() => String(settings[SyncSettingKey.webdavAddress] ?? ''))
/** True for an address whose requests travel unencrypted. */
const webdavUnencrypted = computed(() => /^http:/i.test(webdavAddress.value.trim()))
const webdavUser = computed(() => String(settings[SyncSettingKey.webdavUser] ?? ''))
/** The password field's text; it is sent to be saved and never read back. */
const webdavPassword = ref('')
const passwordSaved = ref(false)

function saveText(key: string, event: Event): void {
  error.value = ''
  setSetting(key, (event.target as HTMLInputElement).value.trim()).catch(reportError)
}

function savePassword(): void {
  error.value = ''
  window.fraitube.setWebdavPassword?.(webdavPassword.value).then(() => {
    passwordSaved.value = webdavPassword.value !== ''
    webdavPassword.value = ''
  }, reportError)
}

// The password is kept for one address, so a changed address asks whether one is saved for it.
watch(webdavAddress, () => {
  window.fraitube.hasWebdavPassword?.().then((saved) => {
    passwordSaved.value = saved
  }, reportError)
}, { immediate: true })

function reportError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

function syncNow(): void {
  error.value = ''
  window.fraitube.syncNow().then((result) => {
    status.value = result
  }, reportError)
}

function chooseFolder(): void {
  error.value = ''
  window.fraitube.chooseSyncFolder().catch(reportError)
}

function chooseRclone(): void {
  error.value = ''
  window.fraitube.chooseRcloneProgram().then((file) => {
    if (file) {
      void loadRemotes()
    }
  }, reportError)
}

function chooseRemote(event: Event): void {
  error.value = ''
  setSetting(SyncSettingKey.rcloneRemote, (event.target as HTMLSelectElement).value).catch(reportError)
}

async function loadRemotes(): Promise<void> {
  loadingRemotes.value = true
  try {
    const result = await window.fraitube.listRcloneRemotes()
    remotes.value = result.remotes
    remotesError.value = result.error ?? ''
  } catch (cause) {
    remotes.value = []
    remotesError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loadingRemotes.value = false
  }
}

// The remotes are read when rclone mode is shown and whenever the executable changes.
watch([mode, rcloneProgram], ([current]) => {
  if (current === 'rclone') {
    void loadRemotes()
  }
}, { immediate: true })

const stopListening = window.fraitube.onSyncStatusChanged((next) => {
  status.value = next
  now.value = Date.now()
})
const clock = setInterval(() => {
  now.value = Date.now()
}, 30_000)
onBeforeUnmount(() => {
  stopListening()
  clearInterval(clock)
})

window.fraitube.getSyncStatus().then((result) => {
  status.value = result
}, reportError)
</script>

<template>
  <div class="panel">
    <div
      v-if="mode === 'folder'"
      class="row"
    >
      <span>Folder</span>
      <span class="value">
        <span class="path">{{ folder || 'No folder chosen' }}</span>
        <button
          type="button"
          @click="chooseFolder"
        >
          Choose folder
        </button>
      </span>
    </div>

    <template v-if="mode === 'rclone'">
      <div class="row">
        <span>Path to the rclone executable</span>
        <span class="value">
          <span class="path">{{ rcloneProgram || 'rclone was not found' }}</span>
          <button
            type="button"
            @click="chooseRclone"
          >
            Choose file
          </button>
        </span>
      </div>
      <div class="row">
        <span>rclone remote</span>
        <span class="value">
          <select
            aria-label="rclone remote"
            :value="remote"
            :disabled="remoteChoices.length === 0"
            @change="chooseRemote"
          >
            <option
              value=""
              disabled
            >
              {{ remoteChoices.length === 0 ? 'No remotes' : 'Choose a remote' }}
            </option>
            <option
              v-for="name in remoteChoices"
              :key="name"
              :value="name"
            >
              {{ name }}
            </option>
          </select>
          <button
            type="button"
            :disabled="loadingRemotes"
            @click="loadRemotes"
          >
            Refresh
          </button>
        </span>
      </div>
      <p
        v-if="remotesError"
        class="error"
      >
        {{ remotesError }}
      </p>
      <p
        v-else-if="remote"
        class="hint"
      >
        Sync files go into {{ remote }}FraiTube
      </p>
    </template>

    <template v-if="mode === 'webdav'">
      <label class="row">
        <span>WebDAV address</span>
        <input
          type="url"
          class="field"
          placeholder="https://example.org/dav/files/name"
          :value="webdavAddress"
          maxlength="500"
          autocapitalize="off"
          spellcheck="false"
          @change="saveText(SyncSettingKey.webdavAddress, $event)"
        >
      </label>
      <label class="row">
        <span>User name</span>
        <input
          type="text"
          class="field"
          :value="webdavUser"
          maxlength="500"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          @change="saveText(SyncSettingKey.webdavUser, $event)"
        >
      </label>
      <div class="row">
        <span>Password</span>
        <span class="value">
          <input
            v-model="webdavPassword"
            type="password"
            class="field"
            aria-label="Password"
            autocomplete="off"
            :placeholder="passwordSaved ? 'Saved' : ''"
          >
          <button
            type="button"
            :disabled="webdavPassword === '' && !passwordSaved"
            @click="savePassword"
          >
            {{ webdavPassword === '' && passwordSaved ? 'Remove' : 'Save' }}
          </button>
        </span>
      </div>
      <p
        v-if="webdavAddress"
        class="hint"
      >
        Sync files go into the folder FraiTube at that address. The password stays on this phone.
      </p>
      <p
        v-if="webdavUnencrypted"
        class="hint warning"
      >
        This address is not encrypted. The password and the sync files can be read by others on the same network.
      </p>
    </template>

    <div class="buttons">
      <button
        type="button"
        :disabled="!status || mode === 'off' || status.running"
        @click="syncNow"
      >
        Sync now
      </button>
    </div>
    <dl
      v-if="status"
      class="status"
    >
      <dt>Status</dt>
      <dd>{{ status.running ? 'Syncing' : mode === 'off' ? 'Off' : 'Ready' }}</dd>
      <dt>Last sync</dt>
      <dd>{{ status.lastSyncAt ? timeAgo(status.lastSyncAt, now) : 'Not yet' }}</dd>
      <template v-if="status.lastSyncAt">
        <dt>Sent</dt>
        <dd>{{ status.sent }} changes</dd>
        <dt>Received</dt>
        <dd>{{ status.received }} changes</dd>
        <dt>Other computers</dt>
        <dd>{{ status.computers }}</dd>
      </template>
    </dl>
    <p
      v-if="status?.lastError"
      class="error"
    >
      {{ status.lastError }}
    </p>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.panel {
  padding-block: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-block: 8px;
}

.value {
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-inline-size: 320px;
  opacity: 0.85;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-block: 8px;
}

.field {
  flex: 1 1 220px;
  min-inline-size: 0;
  max-inline-size: 360px;
}

button,
select,
.field {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
}

button {
  cursor: pointer;
  white-space: nowrap;
}

button:disabled,
select:disabled {
  opacity: 0.6;
  cursor: default;
}

.status {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
}

dt {
  opacity: 0.75;
}

dd {
  margin: 0;
}

.hint {
  margin: 0;
  opacity: 0.75;
  font-size: 0.9rem;
}

.warning {
  margin-block-start: 4px;
  opacity: 1;
  color: #e0a030;
}

.error {
  color: #ff6b6b;
}

/* Phones: rows wrap, buttons wrap, and the status list is one column. */
@media (width < 600px) {
  .row,
  .buttons,
  .value {
    flex-wrap: wrap;
  }

  .row {
    gap: 6px 16px;
  }

  .path {
    max-inline-size: 100%;
  }

  .status {
    grid-template-columns: 1fr;
    gap: 0;
  }

  dd {
    margin-block-end: 6px;
    overflow-wrap: anywhere;
  }
}
</style>
