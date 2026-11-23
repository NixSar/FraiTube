import { toChannel, uniqueChannels } from './channels'
import type { Channel, ImportFormat } from './types'

function parseLines(text: string): unknown[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        throw new Error(`Line ${index + 1} of the FreeTube file is not valid`)
      }
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads a FreeTube subscriptions file (.db). Each line is one profile with its channels; older
 * FreeTube versions wrote one channel per line instead. Channels of every profile are merged.
 */
export function parseFreeTubeSubscriptions(text: string): Channel[] {
  const channels: Channel[] = []
  for (const entry of parseLines(text)) {
    if (!isRecord(entry)) continue
    if (Array.isArray(entry['subscriptions'])) {
      for (const subscription of entry['subscriptions'] as unknown[]) {
        if (!isRecord(subscription)) continue
        const channel = toChannel(subscription['id'], subscription['name'], subscription['thumbnail'])
        if (channel) channels.push(channel)
      }
    } else if ('channelId' in entry) {
      const channel = toChannel(entry['channelId'], entry['channelName'], entry['channelThumbnail'])
      if (channel) channels.push(channel)
    }
  }
  return uniqueChannels(channels)
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

/** Reads a NewPipe subscriptions file (.json), keeping only YouTube channels. */
export function parseNewPipeSubscriptions(text: string): Channel[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('The NewPipe file is not valid JSON')
  }
  if (!isRecord(data) || !Array.isArray(data['subscriptions'])) {
    throw new Error('The NewPipe file has no subscriptions')
  }
  const channels: Channel[] = []
  for (const subscription of data['subscriptions'] as unknown[]) {
    if (!isRecord(subscription) || typeof subscription['url'] !== 'string') continue
    let url: URL
    try {
      url = new URL(subscription['url'])
    } catch {
      continue
    }
    if (!YOUTUBE_HOSTS.has(url.hostname)) continue
    const id = /^\/channel\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    const channel = toChannel(id, subscription['name'], '')
    if (channel) channels.push(channel)
  }
  return uniqueChannels(channels)
}

/** Reads a subscriptions file by its kind: FreeTube's .db or NewPipe's .json. */
export function parseSubscriptionsFile(fileName: string, text: string): { format: ImportFormat; channels: Channel[] } {
  const name = fileName.toLowerCase()
  if (name.endsWith('.db')) {
    return { format: 'freetube', channels: parseFreeTubeSubscriptions(text) }
  }
  if (name.endsWith('.json')) {
    return { format: 'newpipe', channels: parseNewPipeSubscriptions(text) }
  }
  throw new Error('Choose a FreeTube .db file or a NewPipe .json file')
}
