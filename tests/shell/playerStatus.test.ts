import { describe, expect, it } from 'vitest'
import { playerStatusText, VIDEO_DETAILS_STATUS, type PlayerState } from '../../packages/shell/src/renderer/modules/watch/playerStatus'

const playing: PlayerState = { reconnecting: false, switchingTo: '', startingAt: undefined, buffering: false }

describe('player status', () => {
  it('says what the player is doing', () => {
    expect(VIDEO_DETAILS_STATUS).toBe('Getting video details')
    expect(playerStatusText({ ...playing, startingAt: 0 })).toBe('Starting video')
    expect(playerStatusText({ ...playing, startingAt: 754.6 })).toBe('Starting at 12:34')
    expect(playerStatusText({ ...playing, buffering: true })).toBe('Buffering')
    expect(playerStatusText({ ...playing, switchingTo: '1080p' })).toBe('Switching to 1080p')
    expect(playerStatusText({ ...playing, reconnecting: true })).toBe('Reconnecting')
  })

  it('shows nothing while the video simply plays', () => {
    expect(playerStatusText(playing)).toBe('')
  })

  it('names the most telling state when several hold', () => {
    expect(playerStatusText({ reconnecting: true, switchingTo: '720p', startingAt: 10, buffering: true })).toBe('Reconnecting')
    expect(playerStatusText({ ...playing, switchingTo: '720p', buffering: true })).toBe('Switching to 720p')
    expect(playerStatusText({ ...playing, startingAt: 0, buffering: true })).toBe('Starting video')
  })
})
