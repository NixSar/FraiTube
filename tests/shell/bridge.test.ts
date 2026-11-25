import { describe, expect, it } from 'vitest'
import {
  isAllowedProxyUrl,
  isAppPath,
  isChannelVideosRequest,
  isCommentsRequest,
  isProxyRequest,
  isSearchRequest,
  isSuggestionText,
  MAX_PATH_LENGTH,
  MAX_QUERY_LENGTH
} from '../../packages/shell/src/shared/bridge'
import { isChannelId } from '../../packages/subscriptions/src/channels'

describe('isAllowedProxyUrl', () => {
  it('allows YouTube and its video servers over https', () => {
    expect(isAllowedProxyUrl('https://www.youtube.com/youtubei/v1/player')).toBe(true)
    expect(isAllowedProxyUrl('https://rr1---sn-abc.googlevideo.com/videoplayback?x=1')).toBe(true)
  })

  it('refuses other hosts, schemes, ports and credentials', () => {
    expect(isAllowedProxyUrl('http://www.youtube.com/')).toBe(false)
    expect(isAllowedProxyUrl('https://example.com/')).toBe(false)
    expect(isAllowedProxyUrl('https://googlevideo.com.example.com/')).toBe(false)
    expect(isAllowedProxyUrl('https://www.youtube.com:8443/')).toBe(false)
    expect(isAllowedProxyUrl('https://user@www.youtube.com/')).toBe(false)
    expect(isAllowedProxyUrl('not a url')).toBe(false)
  })
})

describe('isProxyRequest', () => {
  const valid = { url: 'https://x.googlevideo.com/a', method: 'POST', headers: { accept: '*/*' }, body: new Uint8Array(2) }

  it('accepts a well-formed request', () => {
    expect(isProxyRequest(valid)).toBe(true)
    expect(isProxyRequest({ ...valid, method: 'GET', body: undefined })).toBe(true)
  })

  it('refuses malformed requests', () => {
    expect(isProxyRequest(null)).toBe(false)
    expect(isProxyRequest({ ...valid, method: 'PUT' })).toBe(false)
    expect(isProxyRequest({ ...valid, url: 'https://example.com/' })).toBe(false)
    expect(isProxyRequest({ ...valid, headers: { accept: 1 } })).toBe(false)
    expect(isProxyRequest({ ...valid, body: 'text' })).toBe(false)
  })
})

describe('isAppPath', () => {
  it('accepts in-app paths', () => {
    expect(isAppPath('/')).toBe(true)
    expect(isAppPath('/channel/UC123?tab=videos')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isAppPath('https://example.com')).toBe(false)
    expect(isAppPath('//example.com')).toBe(false)
    expect(isAppPath('relative')).toBe(false)
    expect(isAppPath(42)).toBe(false)
    expect(isAppPath(undefined)).toBe(false)
    expect(isAppPath('/' + 'a'.repeat(MAX_PATH_LENGTH))).toBe(false)
  })
})

describe('isSearchRequest', () => {
  const token = '123e4567-e89b-42d3-a456-426614174000'

  it('accepts queries with a known filter and an optional token', () => {
    expect(isSearchRequest({ query: 'cats', filter: 'all' })).toBe(true)
    expect(isSearchRequest({ query: 'cats', filter: 'channels', continuation: token })).toBe(true)
    expect(isSearchRequest({ query: 'news', filter: 'live' })).toBe(true)
  })

  it('refuses empty or long queries, unknown filters and bad tokens', () => {
    expect(isSearchRequest({ query: '   ', filter: 'all' })).toBe(false)
    expect(isSearchRequest({ query: 'a'.repeat(MAX_QUERY_LENGTH + 1), filter: 'all' })).toBe(false)
    expect(isSearchRequest({ query: 'cats', filter: 'playlists' })).toBe(false)
    expect(isSearchRequest({ query: 'cats', filter: 'all', continuation: 'abc' })).toBe(false)
    expect(isSearchRequest(null)).toBe(false)
  })
})

describe('isSuggestionText', () => {
  it('accepts text of up to the search box length, empty text included, and refuses other values', () => {
    expect(isSuggestionText('mine')).toBe(true)
    expect(isSuggestionText('')).toBe(true)
    expect(isSuggestionText('a'.repeat(MAX_QUERY_LENGTH))).toBe(true)
    expect(isSuggestionText('a'.repeat(MAX_QUERY_LENGTH + 1))).toBe(false)
    expect(isSuggestionText(5)).toBe(false)
    expect(isSuggestionText(undefined)).toBe(false)
  })
})

describe('isChannelVideosRequest', () => {
  const token = '123e4567-e89b-42d3-a456-426614174000'
  const channelId = 'UCabcdefghijklmnopqrstuv'

  it('accepts a channel with an optional ID from an earlier page', () => {
    expect(isChannelVideosRequest({ channelId })).toBe(true)
    expect(isChannelVideosRequest({ channelId, continuation: token })).toBe(true)
  })

  it('accepts a search inside the channel, and refuses blank, long or non-text queries', () => {
    expect(isChannelVideosRequest({ channelId, query: 'labour' })).toBe(true)
    expect(isChannelVideosRequest({ channelId, query: 'labour', continuation: token })).toBe(true)
    expect(isChannelVideosRequest({ channelId, query: 'a'.repeat(MAX_QUERY_LENGTH) })).toBe(true)
    expect(isChannelVideosRequest({ channelId, query: '   ' })).toBe(false)
    expect(isChannelVideosRequest({ channelId, query: 'a'.repeat(MAX_QUERY_LENGTH + 1) })).toBe(false)
    expect(isChannelVideosRequest({ channelId, query: 7 })).toBe(false)
  })

  it('refuses a missing channel, bad tokens and anything that is not a request', () => {
    expect(isChannelVideosRequest({})).toBe(false)
    expect(isChannelVideosRequest({ channelId: 42 })).toBe(false)
    expect(isChannelVideosRequest({ channelId, continuation: 'abc' })).toBe(false)
    expect(isChannelVideosRequest(null)).toBe(false)
  })

  it('leaves the channel ID itself to the channel ID check, which refuses malformed ones', () => {
    expect(isChannelVideosRequest({ channelId: 'not a channel' })).toBe(true)
    expect(isChannelId('not a channel')).toBe(false)
    expect(isChannelId(channelId)).toBe(true)
  })
})

describe('isCommentsRequest', () => {
  const token = '123e4567-e89b-42d3-a456-426614174000'

  it('accepts a known order and an optional ID from an earlier page', () => {
    expect(isCommentsRequest({ videoId: 'l8qxFcaLSM4', sort: 'top' })).toBe(true)
    expect(isCommentsRequest({ videoId: 'l8qxFcaLSM4', sort: 'newest', continuation: token })).toBe(true)
  })

  it('refuses unknown orders, YouTube tokens and missing video IDs', () => {
    expect(isCommentsRequest({ videoId: 'l8qxFcaLSM4', sort: 'oldest' })).toBe(false)
    expect(isCommentsRequest({ videoId: 'l8qxFcaLSM4', sort: 'top', continuation: 'Eg0SC2w4cXhGY2FMU000GAYy' })).toBe(false)
    expect(isCommentsRequest({ sort: 'top' })).toBe(false)
    expect(isCommentsRequest(null)).toBe(false)
  })
})
