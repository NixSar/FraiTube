import { describe, expect, it } from 'vitest'
import { readChannelIcon } from '../../packages/youtube/src/channelIcon'

function header(sources: unknown[]): unknown {
  return {
    header: {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            image: { decoratedAvatarViewModel: { avatar: { avatarViewModel: { image: { sources } } } } }
          }
        }
      }
    }
  }
}

describe('readChannelIcon', () => {
  it('takes the smallest header picture that is sharp enough', () => {
    expect(readChannelIcon(header([
      { url: 'https://yt3.googleusercontent.com/a=s72-c', width: 72 },
      { url: 'https://yt3.googleusercontent.com/a=s160-c', width: 160 },
      { url: 'https://yt3.googleusercontent.com/a=s120-c', width: 120 }
    ]))).toBe('https://yt3.googleusercontent.com/a=s120-c')
    expect(readChannelIcon(header([{ url: 'https://yt3.googleusercontent.com/a=s72-c', width: 72 }]))).toBe('https://yt3.googleusercontent.com/a=s72-c')
  })

  it('falls back to the large picture of the channel metadata, asked for at a smaller size', () => {
    const data = { metadata: { channelMetadataRenderer: { avatar: { thumbnails: [{ url: 'https://yt3.googleusercontent.com/a=s900-c-k', width: 900 }] } } } }
    expect(readChannelIcon(data)).toBe('https://yt3.googleusercontent.com/a=s176-c-k')
  })

  it('gives an empty string without a usable picture', () => {
    expect(readChannelIcon(header([{ url: 'http://example.com/a.jpg', width: 120 }]))).toBe('')
    expect(readChannelIcon(undefined)).toBe('')
  })
})
