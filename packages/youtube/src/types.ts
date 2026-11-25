/** Shapes shared between the main process and the renderer. Everything here is plain, serializable data, with one helper that picks a part of it. */

/** One adaptive format exactly as YouTube sends it in `streamingData.adaptiveFormats`. */
export type RawFormat = Record<string, unknown>

/** Identifies the client that requested the stream. SABR requests must repeat it. */
export interface ClientInfo {
  clientName: number
  clientVersion: string
  osName?: string
  osVersion?: string
}

/** Everything a SABR stream needs to start. */
export interface SabrSource {
  serverAbrStreamingUrl: string
  ustreamerConfig: string
  clientInfo: ClientInfo
  poToken: string
  formats: RawFormat[]
}

/** What the watch page shows about a video, known from its watch page before the video can play. */
export interface VideoDetails {
  videoId: string
  title: string
  author: string
  channelId: string
  durationSeconds: number
  isLive: boolean
  /** In order of start time; empty when the video has none. */
  chapters: Chapter[]
  /** The preview pictures shown while hovering over the seek bar. */
  storyboard?: Storyboard
  about: VideoAbout
}

export interface VideoPlayback extends VideoDetails {
  /** YouTube's playability status, `OK` when the video can play. */
  status: string
  reason?: string
  sabr?: SabrSource
  captions: CaptionTrack[]
}

/** The details part of a video's playback. */
export function videoDetailsOf(playback: VideoDetails): VideoDetails {
  const { videoId, title, author, channelId, durationSeconds, isLive, chapters, storyboard, about } = playback
  return { videoId, title, author, channelId, durationSeconds, isLive, chapters, ...(storyboard ? { storyboard } : {}), about }
}

/** What the watch page shows under a video. Texts are as YouTube shows them, empty when YouTube gives none. */
export interface VideoAbout {
  channelIcon: string
  /** For example "2.75M subscribers". */
  subscribersText: string
  /** The short view count, for example "409K views". */
  viewsText: string
  /** The exact view count, for example "409,014 views". */
  exactViewsText: string
  /** For example "6 hours ago". */
  relativeDateText: string
  /** For example "Nov 22, 2026". */
  publishDateText: string
  /** For example "13K". */
  likesText: string
  description: DescriptionPart[]
}

export type CommentSort = 'top' | 'newest'

export interface CommentsRequest {
  videoId: string
  sort: CommentSort
  /** From an earlier page: its `continuation` for more comments, or a comment's `replies` for its replies. */
  continuation?: string
}

export interface CommentPage {
  comments: VideoComment[]
  /** Loads the next comments or replies; absent on the last page. */
  continuation?: string
  /** For example "1,892 Comments"; empty on pages of replies and later pages. */
  countText: string
  /** YouTube's notice when comments are turned off; empty otherwise. */
  turnedOffText: string
}

export interface VideoComment {
  id: string
  /** For example "@GamersNexus". */
  authorName: string
  authorChannelId: string
  authorIcon: string
  /** True when the author is the video's channel. */
  isCreator: boolean
  isVerified: boolean
  /** For example "7 hours ago". */
  publishedText: string
  content: DescriptionPart[]
  /** For example "149"; empty without likes. */
  likesText: string
  replyCount: number
  /** For example "Pinned by @GamersNexus"; empty when not pinned. */
  pinnedText: string
  /** A heart sign and, for example, "by @GamersNexus"; empty without a heart from the creator. */
  heartText: string
  /** The creator's icon shown with the heart. */
  heartIcon: string
  /** Loads the replies, as a request's `continuation`; absent without replies. */
  replies?: string
}

/** A piece of a description or comment: plain text, a link to open in the browser, or a time in this video. */
export type DescriptionPart =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; url: string }
  | { kind: 'time'; text: string; seconds: number }

export interface Chapter {
  title: string
  startSeconds: number
  /** A picture of the chapter, or an empty string. */
  thumbnail: string
}

/**
 * Preview pictures of a video, laid out in sheets of `columns` by `rows` pictures.
 * Sheet number n is at `url` with `$M` replaced by n. Picture i shows the video at i * intervalMs.
 */
export interface Storyboard {
  url: string
  width: number
  height: number
  count: number
  columns: number
  rows: number
  intervalMs: number
}

/** Fresh streaming data for a SABR stream that is already playing. */
export interface StreamingReload {
  serverAbrStreamingUrl: string
  ustreamerConfig: string
}

export interface CaptionTrack {
  id: string
  label: string
  language: string
  /** True for tracks YouTube generated with speech recognition. */
  auto: boolean
}

/** One caption line or block, with times in seconds. */
export interface CaptionCue {
  start: number
  end: number
  text: string
}

/** Input for minting a proof of origin token bound to one video. */
export interface PoTokenRequest {
  videoId: string
  context: unknown
  initialAttestationData: unknown
  ytConfig: unknown
}

export type MintPoToken = (request: PoTokenRequest) => Promise<string>

export type SearchFilter = 'all' | 'videos' | 'live' | 'channels' | 'shorts'

export interface SearchRequest {
  query: string
  filter: SearchFilter
  /** Token from an earlier page of the same search, to load the next one. */
  continuation?: string
}

export interface VideoResult {
  id: string
  title: string
  channelId: string
  channelName: string
  /** The channel's icon, or empty when YouTube sent none. */
  channelAvatar: string
  durationText: string
  viewsText: string
  publishedText: string
  thumbnail: string
  isLive: boolean
  /** True for a short, on a channel page; search results keep their shorts in a list of their own. */
  isShort?: boolean
}

export interface ChannelResult {
  id: string
  name: string
  handle: string
  subscribersText: string
  avatar: string
}

/** A channel as its page shows it on top. */
export interface ChannelInfo {
  id: string
  name: string
  /** For example @smartereveryday, or empty when YouTube gives none. */
  handle: string
  subscribersText: string
  avatar: string
}

/** The tabs of a channel page that list videos. */
export type ChannelTab = 'videos' | 'shorts'

export interface ChannelVideosRequest {
  channelId: string
  /** Searches inside the channel instead of listing its newest videos. */
  query?: string
  /** Lists the channel's shorts instead of its videos; a search covers both. */
  tab?: ChannelTab
  /** Token from an earlier page of the same channel or search, to load the next one. */
  continuation?: string
}

/** A page of a channel's videos, newest first, or of its search results. The first page also carries the channel. */
export interface ChannelVideosPage {
  channel?: ChannelInfo
  videos: VideoResult[]
  continuation?: string
}

export interface SearchPage {
  videos: VideoResult[]
  channels: ChannelResult[]
  /** The page's shorts, kept apart from its videos. */
  shorts: VideoResult[]
  continuation?: string
}
