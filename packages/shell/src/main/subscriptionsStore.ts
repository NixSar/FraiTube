import { createRecordTableSql, type ModuleSchema, type Storage } from '@fraitube/storage'
import { isChannel } from '@fraitube/subscriptions'
import type { Channel, ImportFormat, ImportSummary, Subscription } from '@fraitube/subscriptions/types'

/** One record per subscribed channel, keyed by channel ID. Unsubscribing leaves a removal marker for sync. */
export const subscriptionsSchema: ModuleSchema = {
  module: 'subscriptions',
  migrations: [{ version: 1, up: createRecordTableSql('subscriptions') }],
  synced: ['subscriptions']
}

export interface SubscriptionsStore {
  /** Every subscription, by channel name. */
  list(): Subscription[]
  subscribe(channel: Channel): void
  unsubscribe(channelId: string): void
  /** Unsubscribes from every channel, leaving a removal marker for each. */
  clear(): void
  /** Subscribes to every channel not subscribed yet. */
  import(channels: readonly Channel[], format: ImportFormat): ImportSummary
  /** Subscribed channels without an icon. */
  missingAvatars(): Subscription[]
  /** Saves the icon of a subscribed channel; other channels are left alone. */
  setAvatar(channelId: string, avatar: string): void
}

function isSubscription(value: unknown): value is Subscription {
  return isChannel(value) && typeof (value as Partial<Subscription>).subscribedAt === 'number'
}

export function createSubscriptionsStore(storage: Storage, now: () => number = Date.now): SubscriptionsStore {
  const table = storage.records<Subscription>('subscriptions')

  function current(channelId: string): Subscription | undefined {
    const stored = table.get(channelId)
    return isSubscription(stored) ? stored : undefined
  }

  return {
    list() {
      return table.list()
        .map((record) => record.value)
        .filter(isSubscription)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    },
    subscribe(channel) {
      const existing = current(channel.id)
      table.put(channel.id, {
        id: channel.id,
        name: channel.name,
        // A newer save without a picture keeps the picture already known.
        avatar: channel.avatar || existing?.avatar || '',
        subscribedAt: existing?.subscribedAt ?? now()
      })
    },
    unsubscribe(channelId) {
      if (current(channelId)) {
        table.remove(channelId)
      }
    },
    clear() {
      for (const { key, value } of table.list()) {
        if (isSubscription(value)) {
          table.remove(key)
        }
      }
    },
    import(channels, format) {
      let added = 0
      const time = now()
      for (const channel of channels) {
        if (!current(channel.id)) {
          table.put(channel.id, { ...channel, subscribedAt: time })
          added++
        }
      }
      return { format, total: channels.length, added, alreadySubscribed: channels.length - added }
    },
    missingAvatars() {
      return table.list()
        .map((record) => record.value)
        .filter((value) => isSubscription(value) && value.avatar === '')
    },
    setAvatar(channelId, avatar) {
      const existing = current(channelId)
      if (existing && existing.avatar !== avatar) {
        table.put(channelId, { ...existing, avatar })
      }
    }
  }
}
