import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import type { Favorite } from '../../../shared/favorites'
import type { HistoryVideo } from '../../../shared/history'
import type { VideoMenuItem } from '../../components/videoMenu'

/** The favorites, the last added first, shared by every page in this window and kept current. */
const favorites = shallowRef<Favorite[]>([])
const loaded = shallowRef(false)
const favoriteIds = computed(() => new Set(favorites.value.map((favorite) => favorite.videoId)))
let started = false

async function reload(): Promise<void> {
  try {
    favorites.value = await window.fraitube.listFavorites()
  } catch {
    // The list stays as it was until the next change loads it again.
  } finally {
    loaded.value = true
  }
}

function start(): void {
  if (!started) {
    started = true
    window.fraitube.onFavoritesChanged(() => {
      void reload()
    })
    void reload()
  }
}

/** The favorites, the last added first, and whether they have loaded, kept current as they change in any window. */
export function useFavorites(): { favorites: ShallowRef<Favorite[]>; loaded: ShallowRef<boolean> } {
  start()
  return { favorites, loaded }
}

/** What a video's menu offers: adding it to the favorites, or once it is one, removing it. */
export function favoriteAction(isFavorite: boolean): { label: string; add: boolean } {
  return isFavorite ? { label: 'Remove from favorites', add: false } : { label: 'Add to favorites', add: true }
}

/** The menu item that adds a video to the favorites, or removes it when it is one. */
export function useFavoriteMenuItem(): { favoriteItem: (video: HistoryVideo) => VideoMenuItem; favoriteIds: ComputedRef<Set<string>> } {
  start()
  return {
    favoriteIds,
    favoriteItem(video) {
      const action = favoriteAction(favoriteIds.value.has(video.videoId))
      // When saving fails, the video simply keeps its place.
      return {
        label: action.label,
        run: () => void (action.add ? window.fraitube.addFavorite(video) : window.fraitube.removeFavorite(video.videoId)).catch(() => undefined)
      }
    }
  }
}
