import { computed, readonly, ref } from 'vue'
import type { Channel, Subscription } from '@fraitube/subscriptions/types'

const list = ref<Subscription[]>([])
let started: Promise<void> | undefined

async function reload(): Promise<void> {
  list.value = await window.fraitube.listSubscriptions()
}

/** Loads the subscriptions once and follows changes made in any window. */
export function useSubscriptions(): {
  subscriptions: Readonly<typeof list>
  isSubscribed: (channelId: string) => boolean
  /** The saved icon of a subscribed channel, or an empty string. */
  avatarOf: (channelId: string) => string
  ready: Promise<void>
} {
  if (!started) {
    window.fraitube.onSubscriptionsChanged(() => {
      void reload()
    })
    started = reload()
  }
  return {
    subscriptions: readonly(list) as Readonly<typeof list>,
    isSubscribed: (channelId) => byId.value.has(channelId),
    avatarOf: (channelId) => byId.value.get(channelId)?.avatar ?? '',
    ready: started
  }
}

const byId = computed(() => new Map(list.value.map((subscription) => [subscription.id, subscription])))

export function subscribe(channel: Channel): Promise<void> {
  return window.fraitube.subscribe({ id: channel.id, name: channel.name, avatar: channel.avatar })
}

export function unsubscribe(channelId: string): Promise<void> {
  return window.fraitube.unsubscribe(channelId)
}
