import { describe, expect, it } from 'vitest'
import { feedLoadingView } from '../../packages/shell/src/renderer/modules/subscriptions/feedLoading'

const channels = [
  { id: 'UC0000000000000000000001', name: 'First', avatar: 'https://yt3.ggpht.com/first=s88' },
  { id: 'UC0000000000000000000002', name: 'Second', avatar: '' },
  { id: 'UC0000000000000000000003', name: 'Third', avatar: '' },
  { id: 'UC0000000000000000000004', name: 'Fourth', avatar: '' }
]

describe('feedLoadingView', () => {
  it('starts with an empty bar and every channel greyed out', () => {
    const view = feedLoadingView(channels, undefined)
    expect(view.percent).toBe(0)
    expect(view.text).toBe('Fetching 0 of 4 channels')
    expect(view.channels.map((channel) => channel.done)).toEqual([false, false, false, false])
  })

  it('fills the bar and lights up each channel as its videos arrive', () => {
    const view = feedLoadingView(channels, { fetchedChannelIds: ['UC0000000000000000000003', 'UC0000000000000000000001'], fetched: 2, total: 4 })
    expect(view.percent).toBe(50)
    expect(view.text).toBe('Fetching 2 of 4 channels')
    expect(view.channels.map((channel) => channel.done)).toEqual([true, false, true, false])
    expect(view.channels[0]).toEqual({ ...channels[0], done: true })
  })

  it('counts only the channels being fetched, such as a new subscription', () => {
    expect(feedLoadingView(channels, { fetchedChannelIds: [], fetched: 0, total: 1 }).text).toBe('Fetching 0 of 1 channel')
    expect(feedLoadingView([], undefined).text).toBe('Fetching new videos')
  })
})
