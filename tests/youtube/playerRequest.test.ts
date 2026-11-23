import { describe, expect, it } from 'vitest'
import { playerRequestBody } from '../../packages/youtube/src/playerRequest'

describe('playerRequestBody', () => {
  it('asks for the video with the signature timestamp and token', () => {
    const body = playerRequestBody('dQw4w9WgXcQ', 20000, 'TOKEN')
    expect(body).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      playbackContext: { contentPlaybackContext: { signatureTimestamp: 20000 } },
      serviceIntegrityDimensions: { poToken: 'TOKEN' }
    })
    expect(body['playbackContext']).not.toHaveProperty('reloadPlaybackContext')
  })

  it('carries the reload token the SABR server sent', () => {
    const body = playerRequestBody('dQw4w9WgXcQ', 20000, 'TOKEN', 'RELOAD')
    expect(body).toMatchObject({
      playbackContext: { reloadPlaybackContext: { reloadPlaybackParams: { token: 'RELOAD' } } }
    })
  })
})
