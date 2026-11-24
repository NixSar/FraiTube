<script setup lang="ts">
import {
  FEED_DATES,
  FEED_TYPES,
  FEED_WATCHED,
  MAX_TITLE_FILTER_LENGTH,
  type FeedDate,
  type FeedFilters
} from './feedFilters'

const props = defineProps<{
  filters: FeedFilters
  /** The channels to choose from, by name. */
  channels: { id: string; name: string }[]
}>()

const emit = defineEmits<{ change: [filters: FeedFilters] }>()

function update(change: Partial<FeedFilters>): void {
  emit('change', { ...props.filters, ...change })
}
</script>

<template>
  <div class="filter-bar">
    <div class="bar">
      <div class="chip-row">
        <div
          class="chips"
          role="group"
          aria-label="Type"
        >
          <button
            v-for="option in FEED_TYPES"
            :key="option.value"
            type="button"
            class="chip"
            :class="{ active: filters.type === option.value }"
            :aria-pressed="filters.type === option.value"
            @click="update({ type: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
        <span
          class="divider"
          aria-hidden="true"
        />
        <div
          class="chips"
          role="group"
          aria-label="Watched"
        >
          <button
            v-for="option in FEED_WATCHED"
            :key="option.value"
            type="button"
            class="chip"
            :class="{ active: filters.watched === option.value }"
            :aria-pressed="filters.watched === option.value"
            @click="update({ watched: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="fields">
        <select
          class="field date"
          aria-label="Date"
          :value="filters.date"
          @change="update({ date: ($event.target as HTMLSelectElement).value as FeedDate })"
        >
          <option
            v-for="option in FEED_DATES"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <select
          class="field channel"
          aria-label="Channel"
          :value="filters.channel"
          @change="update({ channel: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">
            All channels
          </option>
          <option
            v-for="channel in channels"
            :key="channel.id"
            :value="channel.id"
          >
            {{ channel.name }}
          </option>
        </select>
        <input
          class="field title"
          type="search"
          placeholder="Filter titles"
          aria-label="Filter titles"
          :maxlength="MAX_TITLE_FILTER_LENGTH"
          :value="filters.title"
          @input="update({ title: ($event.target as HTMLInputElement).value })"
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The layout follows the width the bar has, which the side column and window size decide together. */
.filter-bar {
  container-type: inline-size;
  margin-block: 4px 16px;
}

/* Wide: one row, chips on the left and fields on the right. */
.bar {
  display: flex;
  align-items: center;
  gap: 8px 16px;
}

.chip-row {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.chips {
  display: flex;
  flex: none;
  gap: 6px;
}

.divider {
  flex: none;
  inline-size: 1px;
  block-size: 24px;
  background: var(--color-border);
}

.chip {
  min-block-size: 36px;
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.chip:hover {
  background: var(--color-hover);
}

.chip.active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.fields {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  justify-content: flex-end;
  min-inline-size: 0;
}

.field {
  min-block-size: 36px;
  min-inline-size: 0;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
}

.date {
  flex: 0 1 130px;
}

.channel {
  flex: 0 1 200px;
}

.title {
  flex: 0 1 220px;
}

/* Medium and narrow: the chips have their own row, and the fields fill the row under them. */
@container (width < 1000px) {
  .bar {
    flex-direction: column;
    align-items: stretch;
  }

  .fields {
    justify-content: stretch;
  }

  .date {
    flex: 1 1 0;
  }

  .channel {
    flex: 1.5 1 0;
  }

  .title {
    flex: 2 1 0;
  }
}

/* Narrow, as on phones: the chips scroll sideways in their row; Date and Channel share a row and Title has its own. */
@container (width < 560px) {
  .chip-row {
    overflow-x: auto;
    scrollbar-width: none;
    padding-block-end: 2px;
  }

  .fields {
    display: grid;
    flex: none;
    grid-template-columns: 1fr 1fr;
  }

  .title {
    grid-column: 1 / -1;
  }
}
</style>
