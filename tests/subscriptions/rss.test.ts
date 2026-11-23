import { describe, expect, it } from 'vitest'
import { channelFeedUrl, decodeXmlText, parseRssFeed, videosFeedUrl } from '../../packages/subscriptions/src/rss'
import { GAMERS_NEXUS, rssFeed } from './fixtures'

describe('feed URLs', () => {
  it('uses the videos-only playlist feed, with the channel feed as fallback', () => {
    expect(videosFeedUrl(GAMERS_NEXUS)).toBe('https://www.youtube.com/feeds/videos.xml?playlist_id=UULFhIs72whgZI9w6d6FhwGGHA')
    expect(channelFeedUrl(GAMERS_NEXUS)).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${GAMERS_NEXUS}`)
  })
})

describe('parseRssFeed', () => {
  it('reads every valid entry', () => {
    expect(parseRssFeed(rssFeed)).toEqual([
      {
        id: 'l8qxFcaLSM4',
        title: `HW News - DRAM & "Cartel" in Court ${String.fromCodePoint(0x2014)} it's on`,
        channelId: GAMERS_NEXUS,
        channelName: 'Gamers Nexus',
        publishedAt: Date.parse('2026-11-22T14:00:00Z'),
        viewsText: '123K views',
        thumbnail: 'https://i.ytimg.com/vi/l8qxFcaLSM4/mqdefault.jpg'
      },
      {
        id: 'KNVKzPHgg4M',
        title: 'RAM Altman',
        channelId: GAMERS_NEXUS,
        channelName: 'Gamers Nexus',
        publishedAt: Date.parse('2026-11-20T15:30:00Z'),
        viewsText: '1 view',
        thumbnail: 'https://i.ytimg.com/vi/KNVKzPHgg4M/mqdefault.jpg'
      }
    ])
  })

  it('reads nothing from a page that is not a feed', () => {
    expect(parseRssFeed('<html>Error</html>')).toEqual([])
  })
})

describe('decodeXmlText', () => {
  it('decodes named and numbered entities and leaves unknown ones', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &#233; &#x1F600; &nbsp;')).toBe('a & b <c> é \u{1F600} &nbsp;')
  })
})
