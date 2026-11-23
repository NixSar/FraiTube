import { describe, expect, it } from 'vitest'
import { chapterAt, chapterBreaks, chapterIndexAt, previewFrameAt, previewPictureStyle, type PreviewSheets } from '../../packages/player/src/timeline'

const chapters = [
  { title: 'Intro', startSeconds: 0 },
  { title: 'News', startSeconds: 60 },
  { title: 'End', startSeconds: 300 }
]

describe('chapters on the timeline', () => {
  it('finds the chapter playing at a time', () => {
    expect(chapterAt(chapters, 0)?.title).toBe('Intro')
    expect(chapterAt(chapters, 59.9)?.title).toBe('Intro')
    expect(chapterAt(chapters, 60)?.title).toBe('News')
    expect(chapterAt(chapters, 1000)?.title).toBe('End')
    expect(chapterIndexAt([{ title: 'Late', startSeconds: 10 }], 5)).toBe(-1)
    expect(chapterAt([], 5)).toBeUndefined()
  })

  it('places a break where each later chapter starts', () => {
    expect(chapterBreaks(chapters, 600)).toEqual([10, 50])
    expect(chapterBreaks(chapters, 0)).toEqual([])
  })
})

describe('previewPictureStyle', () => {
  const sheets: PreviewSheets = { url: 'https://i.ytimg.com/sb/M$M.jpg', width: 160, height: 90, count: 60, columns: 5, rows: 5, intervalMs: 2000 }

  it('shows the frame at a chapter start, scaled to the box', () => {
    // A chapter at 54.5 seconds: picture 27, sheet 1, column 2, row 0, at half size.
    expect(previewPictureStyle(sheets, 54.5, 80)).toEqual({
      width: '80px',
      height: '45px',
      backgroundImage: 'url("https://i.ytimg.com/sb/M1.jpg")',
      backgroundSize: '400px 225px',
      backgroundPosition: '-160px 0px'
    })
  })

  it('gives different chapters their own frames', () => {
    const first = previewPictureStyle(sheets, 0, 156)
    const later = previewPictureStyle(sheets, 26, 156)
    expect(later.backgroundPosition).not.toBe(first.backgroundPosition)
  })
})

describe('previewFrameAt', () => {
  const sheets: PreviewSheets = { url: 'https://i.ytimg.com/sb/M$M.jpg', width: 160, height: 90, count: 60, columns: 5, rows: 5, intervalMs: 2000 }

  it('finds the sheet and the picture in it', () => {
    expect(previewFrameAt(sheets, 0)).toEqual({ url: 'https://i.ytimg.com/sb/M0.jpg', x: 0, y: 0 })
    // Picture 13: sheet 0, column 3, row 2.
    expect(previewFrameAt(sheets, 26)).toEqual({ url: 'https://i.ytimg.com/sb/M0.jpg', x: 480, y: 180 })
    // Picture 27: sheet 1, column 2, row 0.
    expect(previewFrameAt(sheets, 54.5)).toEqual({ url: 'https://i.ytimg.com/sb/M1.jpg', x: 320, y: 0 })
  })

  it('stays within the pictures there are', () => {
    // The last picture, 59: sheet 2, column 4, row 1.
    expect(previewFrameAt(sheets, 10_000)).toEqual({ url: 'https://i.ytimg.com/sb/M2.jpg', x: 640, y: 90 })
    expect(previewFrameAt(sheets, -5)).toEqual({ url: 'https://i.ytimg.com/sb/M0.jpg', x: 0, y: 0 })
  })
})
