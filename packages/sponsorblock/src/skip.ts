import type { CategoryMode, Segment, SkippableCategory } from './types'

export type CategoryModes = Readonly<Partial<Record<SkippableCategory, CategoryMode>>>

/** Time left in a segment below which it is not skipped, so a skip that just landed never repeats. */
export const MIN_SKIP_SECONDS = 0.05

function modeOf(segment: Segment, modes: CategoryModes): CategoryMode {
  return segment.category === 'poi_highlight' ? 'show' : modes[segment.category] ?? 'off'
}

/** The segments to draw on the seek bar: every segment whose category is not off. */
export function visibleSegments(segments: readonly Segment[], modes: CategoryModes): Segment[] {
  return segments.filter((segment) => modeOf(segment, modes) !== 'off')
}

/**
 * The segment to skip at the given time: a skip segment of a category set to Skip that the time is
 * inside, and that the user did not undo.
 */
export function segmentToSkip(
  segments: readonly Segment[],
  time: number,
  modes: CategoryModes,
  undone: ReadonlySet<string>
): Segment | undefined {
  return segments.find((segment) =>
    segment.actionType === 'skip' &&
    modeOf(segment, modes) === 'skip' &&
    !undone.has(segment.uuid) &&
    time >= segment.start &&
    segment.end - time > MIN_SKIP_SECONDS
  )
}

/** Returns true while the time is inside a mute segment of a category set to Skip. */
export function isMutedAt(segments: readonly Segment[], time: number, modes: CategoryModes): boolean {
  return segments.some((segment) =>
    segment.actionType === 'mute' &&
    modeOf(segment, modes) === 'skip' &&
    time >= segment.start &&
    time < segment.end
  )
}
