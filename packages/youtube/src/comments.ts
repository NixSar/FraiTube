import { readAttributedText } from './about'
import { array, dig, object, text } from './json'
import type { CommentSort, VideoComment } from './types'

/** Shown when YouTube gives no comments section and no notice of its own. */
export const COMMENTS_OFF_TEXT = 'Comments are turned off.'

const HEARTED = 'TOOLBAR_HEART_STATE_HEARTED'
/** The heart sign shown when YouTube gives a hearted comment no text of its own. */
const HEART = String.fromCodePoint(0x2764)

/** Where a video's comments start, or YouTube's notice that they are turned off. */
export interface CommentsSection {
  token?: string
  turnedOffText: string
}

/** One page of comments as YouTube sent it; tokens are YouTube's own continuation tokens. */
export interface RawCommentPage {
  comments: VideoComment[]
  continuation?: string
  countText: string
  /** The first-page tokens of each order, from the sort menu. */
  sortTokens: Partial<Record<CommentSort, string>>
}

/** The comment pages a video handed out: first-page tokens of each order, and YouTube's tokens by the IDs pages hold. */
export interface CommentPages {
  commentSortTokens: Partial<Record<CommentSort, string>>
  commentTokens: Map<string, string>
}

/**
 * The comment pages of a video whose details are fetched again, for example to reconnect its stream.
 * The pages it already handed out stay, so the comments shown can still load their next page and replies.
 */
export function keptCommentPages(previous: CommentPages | undefined): CommentPages {
  return {
    commentSortTokens: { ...previous?.commentSortTokens },
    commentTokens: previous?.commentTokens ?? new Map()
  }
}

/** The continuation token of a continuation item, whether it loads on sight or behind a button. */
function continuationToken(item: unknown): string | undefined {
  const renderer = dig(item, 'continuationItemRenderer')
  const token = dig(renderer, 'continuationEndpoint', 'continuationCommand', 'token') ??
    dig(renderer, 'button', 'buttonRenderer', 'command', 'continuationCommand', 'token')
  return typeof token === 'string' && token ? token : undefined
}

function httpsUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('https://') ? value : ''
}

/** The comments section of a video's watch page data (ytInitialData) or /next response. */
export function readCommentsSection(data: unknown): CommentsSection {
  const section = array(dig(data, 'contents', 'twoColumnWatchNextResults', 'results', 'results', 'contents'))
    .map((item) => dig(item, 'itemSectionRenderer'))
    .find((item) => dig(item, 'sectionIdentifier') === 'comment-item-section')
  const contents = array(dig(section, 'contents'))
  for (const item of contents) {
    const token = continuationToken(item)
    if (token) {
      return { token, turnedOffText: '' }
    }
  }
  const message = contents.map((item) => text(dig(item, 'messageRenderer', 'text')).trim()).find(Boolean)
  return { turnedOffText: message ?? COMMENTS_OFF_TEXT }
}

/** Entity payloads by key, from a response's framework updates. */
function readEntities(response: unknown): Map<string, unknown> {
  const entities = new Map<string, unknown>()
  for (const mutation of array(dig(response, 'frameworkUpdates', 'entityBatchUpdate', 'mutations'))) {
    const key = dig(mutation, 'entityKey')
    if (typeof key === 'string') {
      entities.set(key, dig(mutation, 'payload'))
    }
  }
  return entities
}

function readComment(viewModel: unknown, entities: Map<string, unknown>, videoId: string, repliesToken: string | undefined): VideoComment | undefined {
  const key = dig(viewModel, 'commentKey')
  const entity = typeof key === 'string' ? dig(entities.get(key), 'commentEntityPayload') : undefined
  const properties = dig(entity, 'properties')
  const id = dig(properties, 'commentId')
  if (!object(entity) || typeof id !== 'string') {
    return undefined
  }
  const author = dig(entity, 'author')
  const toolbar = dig(entity, 'toolbar')
  const stateKey = dig(viewModel, 'toolbarStateKey')
  const state = typeof stateKey === 'string' ? dig(entities.get(stateKey), 'engagementToolbarStateEntityPayload') : undefined
  const hearted = dig(state, 'heartState') === HEARTED
  const replyCount = Number.parseInt(String(dig(toolbar, 'replyCount') ?? ''), 10)
  const string = (value: unknown): string => (typeof value === 'string' ? value : '')

  return {
    id,
    authorName: string(dig(author, 'displayName')),
    authorChannelId: string(dig(author, 'channelId')),
    authorIcon: httpsUrl(dig(author, 'avatarThumbnailUrl')),
    isCreator: dig(author, 'isCreator') === true,
    isVerified: dig(author, 'isVerified') === true,
    publishedText: string(dig(properties, 'publishedTime')),
    content: readAttributedText(dig(properties, 'content'), videoId),
    likesText: string(dig(toolbar, 'likeCountNotliked')).trim(),
    replyCount: Number.isFinite(replyCount) && replyCount > 0 ? replyCount : 0,
    pinnedText: string(dig(viewModel, 'pinnedText')),
    heartText: hearted ? string(dig(toolbar, 'heartActiveTooltip')) || HEART : '',
    heartIcon: hearted ? httpsUrl(dig(toolbar, 'creatorThumbnailUrl')) : '',
    replies: repliesToken
  }
}

/** A page of comments or replies from a /next continuation response. */
export function readCommentPage(response: unknown, videoId: string): RawCommentPage {
  const items = array(dig(response, 'onResponseReceivedEndpoints')).flatMap((endpoint) => [
    ...array(dig(endpoint, 'reloadContinuationItemsCommand', 'continuationItems')),
    ...array(dig(endpoint, 'appendContinuationItemsAction', 'continuationItems'))
  ])
  const entities = readEntities(response)
  const page: RawCommentPage = { comments: [], countText: '', sortTokens: {} }

  for (const item of items) {
    const header = dig(item, 'commentsHeaderRenderer')
    if (header !== undefined) {
      page.countText = text(dig(header, 'countText'))
      const [top, newest] = array(dig(header, 'sortMenu', 'sortFilterSubMenuRenderer', 'subMenuItems'))
        .map((entry) => dig(entry, 'serviceEndpoint', 'continuationCommand', 'token'))
      if (typeof top === 'string') page.sortTokens.top = top
      if (typeof newest === 'string') page.sortTokens.newest = newest
      continue
    }
    const thread = dig(item, 'commentThreadRenderer')
    const viewModel = thread !== undefined
      ? dig(thread, 'commentViewModel', 'commentViewModel')
      : dig(item, 'commentViewModel', 'commentViewModel') ?? dig(item, 'commentViewModel')
    if (viewModel !== undefined) {
      const repliesToken = array(dig(thread, 'replies', 'commentRepliesRenderer', 'contents')).map(continuationToken).find(Boolean)
      const comment = readComment(viewModel, entities, videoId, repliesToken)
      if (comment) {
        page.comments.push(comment)
      }
      continue
    }
    page.continuation = continuationToken(item) ?? page.continuation
  }
  return page
}
