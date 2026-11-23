import type { Channel } from './types'

const CHANNEL_ID = /^UC[\w-]{22}$/
/** Longest channel name kept. */
export const MAX_CHANNEL_NAME_LENGTH = 200
/** Longest picture URL kept. */
export const MAX_AVATAR_LENGTH = 1000

export function isChannelId(value: unknown): value is string {
  return typeof value === 'string' && CHANNEL_ID.test(value)
}

/**
 * A channel picture URL the pages may show, or an empty string. Pictures from yt3.googleusercontent.com
 * are the same files as on yt3.ggpht.com, which is the host the pages allow.
 */
export function normalizeAvatar(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) {
    return ''
  }
  let url: URL
  try {
    url = new URL(value.startsWith('//') ? `https:${value}` : value)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return ''
  }
  if (url.hostname === 'yt3.googleusercontent.com') {
    url.hostname = 'yt3.ggpht.com'
  }
  return url.hostname === 'yt3.ggpht.com' ? url.toString() : ''
}

/** A channel built from untrusted data, or undefined when its ID is not a channel ID. */
export function toChannel(id: unknown, name: unknown, avatar: unknown): Channel | undefined {
  if (!isChannelId(id)) {
    return undefined
  }
  const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH) : ''
  return { id, name: cleanName || id, avatar: normalizeAvatar(avatar) }
}

export function isChannel(value: unknown): value is Channel {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const channel = value as Partial<Channel>
  return isChannelId(channel.id) &&
    typeof channel.name === 'string' && channel.name.length > 0 && channel.name.length <= MAX_CHANNEL_NAME_LENGTH &&
    typeof channel.avatar === 'string' && (channel.avatar === '' || normalizeAvatar(channel.avatar) === channel.avatar)
}

/** Keeps the first channel with each ID. */
export function uniqueChannels(channels: Iterable<Channel>): Channel[] {
  const byId = new Map<string, Channel>()
  for (const channel of channels) {
    if (!byId.has(channel.id)) {
      byId.set(channel.id, channel)
    }
  }
  return [...byId.values()]
}
