import { clearWarning } from '../../components/confirmClear'

/** What clearing the search history deletes, for the given number of searches in it. */
export function searchHistoryClearWarning(count: number): string {
  return clearWarning(count === 1 ? 'The 1 saved search is deleted' : `All ${count} saved searches are deleted`)
}
