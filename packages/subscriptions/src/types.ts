/** Shapes shared between the main process and the pages. Everything here is plain, serializable data. */

export interface Channel {
  id: string
  name: string
  /** Picture URL on yt3.ggpht.com, or empty when unknown. */
  avatar: string
}

export interface Subscription extends Channel {
  /** When the channel was subscribed to, in milliseconds. */
  subscribedAt: number
}

export interface FeedVideo {
  id: string
  title: string
  channelId: string
  channelName: string
  /** Publish time in milliseconds. */
  publishedAt: number
  viewsText: string
  thumbnail: string
}

export interface Feed {
  /** Videos of every subscribed channel, newest first. */
  videos: FeedVideo[]
  /** Channels whose feed could not be loaded. */
  failedChannels: Channel[]
  /** When the feed was loaded, in milliseconds. */
  updatedAt: number
}

export type ImportFormat = 'freetube' | 'newpipe'

export interface ImportSummary {
  format: ImportFormat
  /** Channels in the file. */
  total: number
  added: number
  alreadySubscribed: number
}
