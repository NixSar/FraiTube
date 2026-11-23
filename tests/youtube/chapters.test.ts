import { describe, expect, it } from 'vitest'
import { parseTimeText, readChapters } from '../../packages/youtube/src/chapters'

function chapterRenderer(title: string, startMillis: number): unknown {
  return {
    chapterRenderer: {
      title: { simpleText: title },
      timeRangeStartMillis: startMillis,
      thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/${title}-small.jpg`, width: 168 }, { url: `https://i.ytimg.com/${title}.jpg`, width: 336 }] }
    }
  }
}

function playerBar(key: string, chapters: unknown[]): unknown {
  return {
    playerOverlays: {
      playerOverlayRenderer: {
        decoratedPlayerBarRenderer: {
          decoratedPlayerBarRenderer: {
            playerBar: { multiMarkersPlayerBarRenderer: { markersMap: [{ key, value: { chapters } }] } }
          }
        }
      }
    }
  }
}

function panel(items: { title: string; time: string }[]): unknown {
  return {
    engagementPanels: [
      { engagementPanelSectionListRenderer: { panelIdentifier: 'engagement-panel-structured-description' } },
      {
        engagementPanelSectionListRenderer: {
          panelIdentifier: 'engagement-panel-macro-markers-description-chapters',
          content: {
            macroMarkersListRenderer: {
              contents: items.map((item) => ({
                macroMarkersListItemRenderer: { title: { runs: [{ text: item.title }] }, timeDescription: { simpleText: item.time } }
              }))
            }
          }
        }
      }
    ]
  }
}

describe('readChapters', () => {
  it('reads the player bar chapters with exact times and the largest picture', () => {
    const data = playerBar('DESCRIPTION_CHAPTERS', [chapterRenderer('Intro', 0), chapterRenderer('News', 64_500)])
    expect(readChapters(data, 600)).toEqual([
      { title: 'Intro', startSeconds: 0, thumbnail: 'https://i.ytimg.com/Intro.jpg' },
      { title: 'News', startSeconds: 64.5, thumbnail: 'https://i.ytimg.com/News.jpg' }
    ])
  })

  it('also takes automatic chapters', () => {
    expect(readChapters(playerBar('AUTO_CHAPTERS', [chapterRenderer('Start', 0)]), 600)).toHaveLength(1)
  })

  it('falls back to the chapter panel', () => {
    expect(readChapters(panel([{ title: 'Intro', time: '0:00' }, { title: 'Late', time: '1:02:03' }]), 4000)).toEqual([
      { title: 'Intro', startSeconds: 0, thumbnail: '' },
      { title: 'Late', startSeconds: 3723, thumbnail: '' }
    ])
  })

  it('sorts, drops chapters outside the video and repeated start times', () => {
    const data = playerBar('DESCRIPTION_CHAPTERS', [
      chapterRenderer('B', 30_000),
      chapterRenderer('A', 0),
      chapterRenderer('A again', 0),
      chapterRenderer('After the end', 700_000)
    ])
    expect(readChapters(data, 600).map((chapter) => chapter.title)).toEqual(['A', 'B'])
  })

  it('returns no chapters for data without them', () => {
    expect(readChapters(undefined, 600)).toEqual([])
    expect(readChapters({ contents: {} }, 600)).toEqual([])
  })
})

describe('parseTimeText', () => {
  it('reads minutes and hours', () => {
    expect(parseTimeText('4:05')).toBe(245)
    expect(parseTimeText('1:02:03')).toBe(3723)
    expect(parseTimeText('soon')).toBeUndefined()
  })
})
