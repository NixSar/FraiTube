/** Sample subscription files in the formats FreeTube and NewPipe export. */

export const GAMERS_NEXUS = 'UChIs72whgZI9w6d6FhwGGHA'
export const HARDWARE_UNBOXED = 'UCI8iQa1hv7oV_Z8D35vVuSg'
export const LEVEL1_TECHS = 'UC4w1YQAJMWOz4qtxinq55LQ'
export const LINUS_TECH_TIPS = 'UCXuqSBlHAE6Xw-yeJA0Tunw'

/** FreeTube's current format: one profile per line, each with its channels. */
export const freeTubeFile = [
  JSON.stringify({
    _id: 'allChannels',
    name: 'All Channels',
    bgColor: '#000000',
    textColor: '#FFFFFF',
    subscriptions: [
      { id: GAMERS_NEXUS, name: 'Gamers Nexus', thumbnail: 'https://yt3.googleusercontent.com/gn=s88' },
      { id: HARDWARE_UNBOXED, name: 'Hardware Unboxed', thumbnail: 'https://yt3.ggpht.com/hu=s88' }
    ]
  }),
  JSON.stringify({
    _id: 'tech',
    name: 'Tech',
    bgColor: '#123456',
    textColor: '#FFFFFF',
    subscriptions: [
      { id: GAMERS_NEXUS, name: 'Gamers Nexus', thumbnail: '' },
      { id: LEVEL1_TECHS, name: 'Level1Techs', thumbnail: 'https://evil.example/picture.png' },
      { id: 'not-a-channel', name: 'Broken', thumbnail: '' }
    ]
  }),
  ''
].join('\n')

/** FreeTube's old format: one channel per line. */
export const oldFreeTubeFile = [
  JSON.stringify({ channelId: LINUS_TECH_TIPS, channelName: 'Linus Tech Tips', channelThumbnail: '//yt3.ggpht.com/ltt=s88', profile: [{ value: 'All Channels' }], _id: 'a' }),
  JSON.stringify({ channelId: GAMERS_NEXUS, channelName: 'Gamers Nexus', channelThumbnail: '', profile: [{ value: 'All Channels' }], _id: 'b' }),
  ''
].join('\n')

export const newPipeFile = JSON.stringify({
  app_version: '0.27.0',
  app_version_int: 1000,
  subscriptions: [
    { service_id: 0, url: `https://www.youtube.com/channel/${GAMERS_NEXUS}`, name: 'Gamers Nexus' },
    { service_id: 0, url: `https://youtube.com/channel/${LINUS_TECH_TIPS}/`, name: 'Linus Tech Tips' },
    { service_id: 1, url: 'https://soundcloud.com/someone', name: 'SoundCloud artist' },
    { service_id: 0, url: 'https://www.youtube.com/@handle', name: 'Handle only' },
    { service_id: 0, url: 'not a url', name: 'Broken' }
  ]
})

export const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Gamers Nexus</title>
 <author>
  <name>Gamers Nexus</name>
  <uri>https://www.youtube.com/channel/${GAMERS_NEXUS}</uri>
 </author>
 <entry>
  <id>yt:video:l8qxFcaLSM4</id>
  <yt:videoId>l8qxFcaLSM4</yt:videoId>
  <yt:channelId>${GAMERS_NEXUS}</yt:channelId>
  <title>HW News - DRAM &amp; &quot;Cartel&quot; in Court &#x2014; it&#39;s on</title>
  <author><name>Gamers Nexus</name></author>
  <published>2026-11-22T14:00:00+00:00</published>
  <media:group>
   <media:thumbnail url="https://i3.ytimg.com/vi/l8qxFcaLSM4/hqdefault.jpg" width="480" height="360"/>
   <media:community>
    <media:statistics views="123456"/>
   </media:community>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:KNVKzPHgg4M</id>
  <yt:videoId>KNVKzPHgg4M</yt:videoId>
  <yt:channelId>${GAMERS_NEXUS}</yt:channelId>
  <title>RAM Altman</title>
  <author><name>Gamers Nexus</name></author>
  <published>2026-11-20T15:30:00+00:00</published>
  <media:group>
   <media:community>
    <media:statistics views="1"/>
   </media:community>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>bad</yt:videoId>
  <published>2026-11-20T15:30:00+00:00</published>
 </entry>
</feed>`
