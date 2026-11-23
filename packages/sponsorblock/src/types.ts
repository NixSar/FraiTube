/** Categories a segment can be skipped or shown for. */
export type SkippableCategory =
  | 'sponsor'
  | 'selfpromo'
  | 'interaction'
  | 'intro'
  | 'outro'
  | 'preview'
  | 'music_offtopic'
  | 'filler'

/** The highlight category, a single point in the video. */
export type HighlightCategory = 'poi_highlight'

export type Category = SkippableCategory | HighlightCategory

/** What happens to a segment: skipped over, muted while it plays, or a highlight point. */
export type ActionType = 'skip' | 'mute' | 'poi'

/** What the user chose for a category. */
export type CategoryMode = 'skip' | 'show' | 'off'

export interface Segment {
  /** The server's ID for the segment. */
  uuid: string
  category: Category
  actionType: ActionType
  /** In seconds. Equal for a highlight point. */
  start: number
  end: number
}
