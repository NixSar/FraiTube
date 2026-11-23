import { isHistoryVideo, type HistoryVideo } from './history'

/** A favorite video: its details, and when it was added, in milliseconds. */
export interface Favorite extends HistoryVideo {
  addedAt: number
}

export function isFavorite(value: unknown): value is Favorite {
  return isHistoryVideo(value) && typeof (value as Partial<Favorite>).addedAt === 'number'
}
