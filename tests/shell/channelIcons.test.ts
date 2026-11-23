import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '../../packages/subscriptions/src/types'
import { createIconFiller, ICON_REQUEST_GAP_MS, ICONS_PER_ANNOUNCEMENT } from '../../packages/shell/src/main/channelIcons'

function channel(index: number): Channel {
  return { id: `UC${String(index).padStart(22, '0')}`, name: `Channel ${index}`, avatar: '' }
}

/** A list of channels without icons that loses each channel once its icon is saved. */
function setup(count: number, fetchIcon: (channelId: string) => Promise<string>) {
  const missing = new Map(Array.from({ length: count }, (_, index) => channel(index)).map((item) => [item.id, item]))
  const saved = new Map<string, string>()
  const waits: number[] = []
  const announce = vi.fn()
  const filler = createIconFiller({
    missing: () => [...missing.values()],
    fetchIcon,
    save: (channelId, avatar) => {
      saved.set(channelId, avatar)
      missing.delete(channelId)
    },
    announce,
    wait: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    }
  })
  return { filler, missing, saved, waits, announce }
}

describe('createIconFiller', () => {
  it('saves the icons, with a pause between requests, and announces them in groups', async () => {
    const { filler, saved, waits, announce } = setup(12, (id) => Promise.resolve(`https://yt3.googleusercontent.com/${id}=s120`))
    await filler.fill()
    expect(saved.size).toBe(12)
    expect([...saved.values()][0]).toBe(`https://yt3.ggpht.com/${channel(0).id}=s120`)
    expect(waits).toEqual(Array(11).fill(ICON_REQUEST_GAP_MS))
    expect(announce).toHaveBeenCalledTimes(Math.ceil(12 / ICONS_PER_ANNOUNCEMENT))
  })

  it('keeps no icon from another host and asks once per run about a channel without one', async () => {
    const fetchIcon = vi.fn(() => Promise.resolve('https://example.com/icon.jpg'))
    const { filler, saved, announce } = setup(2, fetchIcon)
    await filler.fill()
    await filler.fill()
    expect(saved.size).toBe(0)
    expect(fetchIcon).toHaveBeenCalledTimes(2)
    expect(announce).not.toHaveBeenCalled()
  })

  it('tries a failed request again the next time', async () => {
    let fail = true
    const fetchIcon = vi.fn((id: string) => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(`https://yt3.ggpht.com/${id}`)))
    const { filler, saved } = setup(1, fetchIcon)
    await filler.fill()
    expect(saved.size).toBe(0)
    fail = false
    await filler.fill()
    expect(saved.size).toBe(1)
  })

  it('looks again for channels added while it was running', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { filler, missing, saved } = setup(1, async (id) => {
      await gate
      return `https://yt3.ggpht.com/${id}`
    })
    const first = filler.fill()
    const added = channel(99)
    missing.set(added.id, added)
    const second = filler.fill()
    release()
    await Promise.all([first, second])
    expect(saved.has(added.id)).toBe(true)
  })
})
