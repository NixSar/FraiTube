import { computed, ref, watch, type ComputedRef } from 'vue'

/** Cards shown at first, and added each time the end of the list comes near. */
export const PAGE_SIZE = 48

/** How many cards are shown after asking for more. */
export function nextShownCount(shown: number, total: number): number {
  return Math.min(total, shown + PAGE_SIZE)
}

/**
 * The first part of a list, growing by a page at a time, so pages with hundreds of videos lay out
 * only what is shown. It starts again at one page when a new list replaces the old one, or, when
 * startOver is given, only when its value changes, so a list that grows keeps what is shown.
 */
export function usePaging<T>(source: () => readonly T[], startOver: () => unknown = source): {
  shown: ComputedRef<readonly T[]>
  hasMore: ComputedRef<boolean>
  showMore: () => void
} {
  const count = ref(PAGE_SIZE)
  watch(startOver, () => {
    count.value = PAGE_SIZE
  })
  return {
    shown: computed(() => source().slice(0, count.value)),
    hasMore: computed(() => source().length > count.value),
    showMore() {
      count.value = Math.max(PAGE_SIZE, nextShownCount(count.value, source().length))
    }
  }
}
