/** A named part of a video, starting at startSeconds and running until the next one starts. */
export interface TimelineChapter {
  title: string
  startSeconds: number
}

/**
 * Preview pictures laid out in sheets of `columns` by `rows` pictures of width by height pixels.
 * Sheet number n is at `url` with `$M` replaced by n. Picture i shows the video at i * intervalMs.
 */
export interface PreviewSheets {
  url: string
  width: number
  height: number
  count: number
  columns: number
  rows: number
  intervalMs: number
}

/** Where one preview picture sits: the sheet's URL and the picture's offset in that sheet, in pixels. */
export interface PreviewFrame {
  url: string
  x: number
  y: number
}

/** The index of the chapter playing at the time, or -1 before the first chapter or without chapters. */
export function chapterIndexAt(chapters: readonly TimelineChapter[], seconds: number): number {
  let found = -1
  for (let i = 0; i < chapters.length; i++) {
    if ((chapters[i]?.startSeconds ?? Infinity) <= seconds) {
      found = i
    } else {
      break
    }
  }
  return found
}

/** The chapter playing at the time, or undefined. */
export function chapterAt<T extends TimelineChapter>(chapters: readonly T[], seconds: number): T | undefined {
  return chapters[chapterIndexAt(chapters, seconds)]
}

/** Where each chapter after the first starts, in percent of the video, for the gaps on the seek bar. */
export function chapterBreaks(chapters: readonly TimelineChapter[], durationSeconds: number): number[] {
  if (durationSeconds <= 0) {
    return []
  }
  return chapters
    .map((chapter) => (chapter.startSeconds / durationSeconds) * 100)
    .filter((percent) => percent > 0 && percent < 100)
}

/** Style that shows the preview picture for the time in a box of the given width, as a part of its image sheet. */
export function previewPictureStyle(sheets: PreviewSheets, seconds: number, width: number): Record<string, string> {
  const scale = width / sheets.width
  const frame = previewFrameAt(sheets, seconds)
  return {
    width: `${width}px`,
    height: `${Math.round(sheets.height * scale)}px`,
    backgroundImage: `url(${JSON.stringify(frame.url)})`,
    backgroundSize: `${sheets.columns * sheets.width * scale}px ${sheets.rows * sheets.height * scale}px`,
    backgroundPosition: `${-frame.x * scale}px ${-frame.y * scale}px`
  }
}

/** The preview picture for the time. */
export function previewFrameAt(sheets: PreviewSheets, seconds: number): PreviewFrame {
  const perSheet = sheets.columns * sheets.rows
  const index = Math.min(sheets.count - 1, Math.max(0, Math.floor((seconds * 1000) / sheets.intervalMs)))
  const sheet = Math.floor(index / perSheet)
  const place = index % perSheet
  return {
    url: sheets.url.replace('$M', String(sheet)),
    x: (place % sheets.columns) * sheets.width,
    y: Math.floor(place / sheets.columns) * sheets.height
  }
}
