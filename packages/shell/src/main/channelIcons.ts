import { normalizeAvatar } from '@fraitube/subscriptions'
import type { Channel } from '@fraitube/subscriptions/types'

/** The pause between two icon requests, so a long list never floods YouTube. */
export const ICON_REQUEST_GAP_MS = 500
/** Saved icons are announced in groups, so pages reload the list now and then rather than for every icon. */
export const ICONS_PER_ANNOUNCEMENT = 10

export interface IconFillerOptions {
  /** Subscribed channels without an icon. */
  missing(): Channel[]
  fetchIcon(channelId: string): Promise<string>
  save(channelId: string, avatar: string): void
  /** Tells the pages that icons were saved. */
  announce(): void
  wait?: (ms: number) => Promise<void>
}

export interface IconFiller {
  /** Fetches and saves the missing icons; a call while it runs makes it look again once done. */
  fill(): Promise<void>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A channel YouTube gives no icon for is asked about once per run of the app, not again and again. */
export function createIconFiller(options: IconFillerOptions): IconFiller {
  const wait = options.wait ?? sleep
  const tried = new Set<string>()
  let running: Promise<void> | undefined
  let again = false

  async function run(): Promise<void> {
    do {
      again = false
      let unannounced = 0
      let first = true
      for (const channel of options.missing()) {
        if (tried.has(channel.id)) continue
        tried.add(channel.id)
        if (!first) {
          await wait(ICON_REQUEST_GAP_MS)
        }
        first = false
        let avatar: string
        try {
          avatar = normalizeAvatar(await options.fetchIcon(channel.id))
        } catch {
          // A failed request is tried again the next time icons are filled.
          tried.delete(channel.id)
          continue
        }
        if (avatar) {
          options.save(channel.id, avatar)
          unannounced++
          if (unannounced >= ICONS_PER_ANNOUNCEMENT) {
            options.announce()
            unannounced = 0
          }
        }
      }
      if (unannounced > 0) {
        options.announce()
      }
    } while (again)
  }

  return {
    fill() {
      if (running) {
        again = true
        return running
      }
      running = run().finally(() => {
        running = undefined
      })
      return running
    }
  }
}
