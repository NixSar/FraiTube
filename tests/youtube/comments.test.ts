import { describe, expect, it } from 'vitest'
import { COMMENTS_OFF_TEXT, keptCommentPages, readCommentPage, readCommentsSection } from '../../packages/youtube/src/comments'

describe('keptCommentPages', () => {
  it('keeps the pages a video handed out when its details are fetched again', () => {
    const previous = { commentSortTokens: { newest: 'newest-token' }, commentTokens: new Map([['page-id', 'youtube-token']]) }
    const kept = keptCommentPages(previous)
    expect(kept.commentTokens.get('page-id')).toBe('youtube-token')
    expect(kept.commentSortTokens).toEqual({ newest: 'newest-token' })
  })

  it('starts empty for a video fetched the first time', () => {
    const fresh = keptCommentPages(undefined)
    expect(fresh.commentTokens.size).toBe(0)
    expect(fresh.commentSortTokens).toEqual({})
  })
})

const videoId = 'l8qxFcaLSM4'
/** The text YouTube gives a comment the creator gave a heart: a heart sign and who gave it. */
const HEART_TEXT = `${String.fromCodePoint(0x2764)} by @GamersNexus`

function watchData(sectionContents: unknown[] | undefined): unknown {
  const contents = sectionContents === undefined
    ? []
    : [{ itemSectionRenderer: { sectionIdentifier: 'comment-item-section', contents: sectionContents } }]
  return { contents: { twoColumnWatchNextResults: { results: { results: { contents } } } } }
}

function continuation(token: string): unknown {
  return { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } }
}

function entity(key: string, payload: unknown): unknown {
  return { entityKey: key, payload }
}

function commentEntity(id: string, extra: { replyCount?: string; creator?: boolean; heartIcon?: string; content?: unknown } = {}): unknown {
  return {
    commentEntityPayload: {
      properties: {
        commentId: id,
        content: extra.content ?? { content: `Text of ${id}` },
        publishedTime: '7 hours ago'
      },
      author: {
        channelId: `UC${id}`,
        displayName: `@author${id}`,
        avatarThumbnailUrl: `https://yt3.ggpht.com/${id}`,
        isVerified: extra.creator === true,
        isCreator: extra.creator === true
      },
      toolbar: {
        likeCountNotliked: extra.creator === true ? '149' : '',
        replyCount: extra.replyCount ?? '',
        heartActiveTooltip: HEART_TEXT,
        ...(extra.heartIcon ? { creatorThumbnailUrl: extra.heartIcon } : {})
      }
    }
  }
}

function heartState(hearted: boolean): unknown {
  return { engagementToolbarStateEntityPayload: { heartState: hearted ? 'TOOLBAR_HEART_STATE_HEARTED' : 'TOOLBAR_HEART_STATE_UNHEARTED' } }
}

const firstPage = {
  onResponseReceivedEndpoints: [
    {
      reloadContinuationItemsCommand: {
        continuationItems: [{
          commentsHeaderRenderer: {
            countText: { runs: [{ text: '1,892' }, { text: ' Comments' }] },
            sortMenu: {
              sortFilterSubMenuRenderer: {
                subMenuItems: [
                  { title: 'Top', serviceEndpoint: { continuationCommand: { token: 'top-token' } } },
                  { title: 'Newest', serviceEndpoint: { continuationCommand: { token: 'newest-token' } } }
                ]
              }
            }
          }
        }]
      }
    },
    {
      reloadContinuationItemsCommand: {
        continuationItems: [
          {
            commentThreadRenderer: {
              replies: { commentRepliesRenderer: { contents: [continuation('replies-token')] } },
              commentViewModel: { commentViewModel: { commentKey: 'k1', toolbarStateKey: 's1', pinnedText: 'Pinned by @GamersNexus', commentId: 'c1' } }
            }
          },
          {
            commentThreadRenderer: {
              commentViewModel: { commentViewModel: { commentKey: 'k2', toolbarStateKey: 's2', commentId: 'c2' } }
            }
          },
          { commentThreadRenderer: { commentViewModel: { commentViewModel: { commentKey: 'missing' } } } },
          continuation('more-token')
        ]
      }
    }
  ],
  frameworkUpdates: {
    entityBatchUpdate: {
      mutations: [
        entity('k1', commentEntity('c1', {
          replyCount: '21',
          creator: true,
          content: {
            content: 'See 1:02 and https://example.com',
            commandRuns: [
              { startIndex: 4, length: 4, onTap: { innertubeCommand: { watchEndpoint: { videoId, startTimeSeconds: 62 } } } },
              { startIndex: 13, length: 19, onTap: { innertubeCommand: { urlEndpoint: { url: 'https://www.youtube.com/redirect?event=comments&q=https%3A%2F%2Fexample.com' } } } }
            ]
          }
        })),
        entity('s1', heartState(false)),
        entity('k2', commentEntity('c2', { heartIcon: 'https://yt3.ggpht.com/creator' })),
        entity('s2', heartState(true))
      ]
    }
  }
}

describe('readCommentsSection', () => {
  it('finds where the comments start', () => {
    expect(readCommentsSection(watchData([continuation('section-token')]))).toEqual({ token: 'section-token', turnedOffText: '' })
  })

  it("gives YouTube's notice, or a notice of its own, when comments are off", () => {
    const message = { messageRenderer: { text: { runs: [{ text: 'Comments are turned off. ' }, { text: 'Learn more' }] } } }
    expect(readCommentsSection(watchData([message]))).toEqual({ turnedOffText: 'Comments are turned off. Learn more' })
    expect(readCommentsSection(watchData(undefined))).toEqual({ turnedOffText: COMMENTS_OFF_TEXT })
  })
})

describe('readCommentPage', () => {
  it('reads the count, both orders and the next page', () => {
    const page = readCommentPage(firstPage, videoId)
    expect(page.countText).toBe('1,892 Comments')
    expect(page.sortTokens).toEqual({ top: 'top-token', newest: 'newest-token' })
    expect(page.continuation).toBe('more-token')
  })

  it('reads pinned comments, creators, likes, replies and links, and skips comments without data', () => {
    const [pinned, hearted, ...rest] = readCommentPage(firstPage, videoId).comments
    expect(rest).toEqual([])
    expect(pinned).toEqual({
      id: 'c1',
      authorName: '@authorc1',
      authorChannelId: 'UCc1',
      authorIcon: 'https://yt3.ggpht.com/c1',
      isCreator: true,
      isVerified: true,
      publishedText: '7 hours ago',
      content: [
        { kind: 'text', text: 'See ' },
        { kind: 'time', text: '1:02', seconds: 62 },
        { kind: 'text', text: ' and ' },
        { kind: 'link', text: 'https://example.com', url: 'https://example.com/' }
      ],
      likesText: '149',
      replyCount: 21,
      pinnedText: 'Pinned by @GamersNexus',
      heartText: '',
      heartIcon: '',
      replies: 'replies-token'
    })
    expect(hearted).toMatchObject({ id: 'c2', likesText: '', replyCount: 0, pinnedText: '', heartText: HEART_TEXT, heartIcon: 'https://yt3.ggpht.com/creator' })
    expect(hearted?.replies).toBeUndefined()
  })

  it('reads a page of replies with its button for more', () => {
    const replies = {
      onResponseReceivedEndpoints: [{
        appendContinuationItemsAction: {
          continuationItems: [
            { commentViewModel: { commentKey: 'r1', toolbarStateKey: 'rs1', commentId: 'r1' } },
            { continuationItemRenderer: { button: { buttonRenderer: { command: { continuationCommand: { token: 'more-replies' } } } } } }
          ]
        }
      }],
      frameworkUpdates: { entityBatchUpdate: { mutations: [entity('r1', commentEntity('r1')), entity('rs1', heartState(false))] } }
    }
    const page = readCommentPage(replies, videoId)
    expect(page.comments.map((comment) => comment.id)).toEqual(['r1'])
    expect(page.continuation).toBe('more-replies')
    expect(page.countText).toBe('')
  })

  it('reads nothing from an empty response', () => {
    expect(readCommentPage({}, videoId)).toEqual({ comments: [], countText: '', sortTokens: {} })
  })
})
