/** The buffered times of one buffer, as a SourceBuffer's `buffered` gives them. */
export interface BufferedRanges {
  readonly length: number
  start(index: number): number
  end(index: number): number
}

/** Where the buffer holds data at or after `time`: the time itself when it holds data there. */
function dataStartFrom(ranges: BufferedRanges, time: number): number | undefined {
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.end(i) > time) {
      return Math.max(ranges.start(i), time)
    }
  }
  return undefined
}

/**
 * The earliest time at or after `from` that every buffer holds data for, or undefined while there is none.
 * Each step moves to where a buffer that lacks data at the time next has some, until all have it.
 */
export function firstCoveredTime(buffers: readonly BufferedRanges[], from: number): number | undefined {
  let time = from
  while (buffers.length > 0) {
    let next = time
    for (const ranges of buffers) {
      const start = dataStartFrom(ranges, time)
      if (start === undefined) {
        return undefined
      }
      next = Math.max(next, start)
    }
    if (next === time) {
      return time
    }
    time = next
  }
  return undefined
}
