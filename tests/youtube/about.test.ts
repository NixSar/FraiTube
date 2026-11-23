import { describe, expect, it } from 'vitest'
import { readAbout } from '../../packages/youtube/src/about'

const videoId = 'l8qxFcaLSM4'
const content = 'Store https://example.com/a\n01:57 News\nSite http://example.org/\n#tag'

function run(start: number, length: number, command: unknown): unknown {
  return { startIndex: start, length, onTap: { innertubeCommand: command } }
}

function redirect(target: string): unknown {
  return { urlEndpoint: { url: `https://www.youtube.com/redirect?event=video_description&q=${encodeURIComponent(target)}&v=${videoId}` } }
}

function watchDataWith(commandRuns: unknown[]): unknown {
  return {
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            {
              videoPrimaryInfoRenderer: {
                viewCount: {
                  videoViewCountRenderer: {
                    viewCount: { simpleText: '409,014 views' },
                    extraShortViewCount: { simpleText: '409K' },
                    originalViewCount: '409014'
                  }
                },
                dateText: { simpleText: 'Nov 22, 2026' },
                relativeDateText: { simpleText: '6 hours ago' },
                videoActions: {
                  menuRenderer: {
                    topLevelButtons: [{
                      segmentedLikeDislikeButtonViewModel: { likeCountEntity: { likeCountIfIndifferent: { content: '13K' } } }
                    }]
                  }
                }
              }
            },
            {
              videoSecondaryInfoRenderer: {
                owner: {
                  videoOwnerRenderer: {
                    thumbnail: {
                      thumbnails: [
                        { url: 'https://yt3.ggpht.com/icon=s48', width: 48 },
                        { url: 'https://yt3.ggpht.com/icon=s176', width: 176 }
                      ]
                    },
                    subscriberCountText: { simpleText: '2.75M subscribers' }
                  }
                },
                attributedDescription: {
                  content,
                  commandRuns
                }
              }
            }
          ]
        }
      }
    }
  }
}
}

const watchData = watchDataWith([
  run(6, 21, redirect('https://example.com/a')),
  run(28, 5, { watchEndpoint: { videoId, startTimeSeconds: 117 } }),
  run(44, 19, redirect('http://example.org/')),
  run(64, 4, { commandMetadata: { webCommandMetadata: { url: '/hashtag/tag' } }, browseEndpoint: { browseId: 'FEhashtag' } })
])

describe('readAbout', () => {
  it('reads the channel, counts and date as YouTube shows them', () => {
    const about = readAbout(watchData, videoId)
    expect(about).toMatchObject({
      channelIcon: 'https://yt3.ggpht.com/icon=s176',
      subscribersText: '2.75M subscribers',
      viewsText: '409K views',
      exactViewsText: '409,014 views',
      relativeDateText: '6 hours ago',
      publishDateText: 'Nov 22, 2026',
      likesText: '13K'
    })
  })

  it('splits the description into text, links without the redirect page, and times in this video', () => {
    expect(readAbout(watchData, videoId).description).toEqual([
      { kind: 'text', text: 'Store ' },
      { kind: 'link', text: 'https://example.com/a', url: 'https://example.com/a' },
      { kind: 'text', text: '\n' },
      { kind: 'time', text: '01:57', seconds: 117 },
      { kind: 'text', text: ' News\nSite ' },
      { kind: 'link', text: 'http://example.org/', url: 'http://example.org/' },
      { kind: 'text', text: '\n' },
      { kind: 'link', text: '#tag', url: 'https://www.youtube.com/hashtag/tag' }
    ])
  })

  it('keeps a link to another video as a link and drops links that are not web links', () => {
    const data = watchDataWith([
      run(28, 5, { commandMetadata: { webCommandMetadata: { url: '/watch?v=other123456' } }, watchEndpoint: { videoId: 'other123456' } }),
      run(64, 4, { urlEndpoint: { url: 'javascript:alert(1)' } })
    ])
    const parts = readAbout(data, videoId).description
    expect(parts).toContainEqual({ kind: 'link', text: '01:57', url: 'https://www.youtube.com/watch?v=other123456' })
    expect(parts.filter((part) => part.kind !== 'text')).toHaveLength(1)
    expect(parts.map((part) => part.text).join('')).toBe(content)
  })

  it('falls back to the description panel and gives empty texts without data', () => {
    const panelData = {
      engagementPanels: [{
        engagementPanelSectionListRenderer: {
          panelIdentifier: 'engagement-panel-structured-description',
          content: {
            structuredDescriptionContentRenderer: {
              items: [
                {
                  videoDescriptionHeaderRenderer: {
                    views: { simpleText: '1,234 views' },
                    publishDate: { simpleText: 'Jan 1, 2026' },
                    channelThumbnail: { thumbnails: [{ url: 'https://yt3.ggpht.com/panel' }] },
                    factoid: [{ factoidRenderer: { value: { simpleText: '56' }, label: { simpleText: 'Likes' } } }]
                  }
                },
                { expandableVideoDescriptionBodyRenderer: { attributedDescriptionBodyText: { content: 'Hello' } } }
              ]
            }
          }
        }
      }]
    }
    expect(readAbout(panelData, videoId)).toEqual({
      channelIcon: 'https://yt3.ggpht.com/panel',
      subscribersText: '',
      viewsText: '1,234 views',
      exactViewsText: '1,234 views',
      relativeDateText: '',
      publishDateText: 'Jan 1, 2026',
      likesText: '56',
      description: [{ kind: 'text', text: 'Hello' }]
    })
    expect(readAbout(undefined, videoId).description).toEqual([])
  })
})
