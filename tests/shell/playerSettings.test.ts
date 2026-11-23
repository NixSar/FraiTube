import { describe, expect, it } from 'vitest'
import { PlayerSettingKey, playerSettings } from '../../packages/shell/src/shared/playerSettings'

describe('PiP setting', () => {
  it('moves the video to PiP when leaving its page unless turned off, under Playback', () => {
    expect(playerSettings.settings.find((setting) => setting.key === PlayerSettingKey.pipOnLeave)).toMatchObject({
      type: 'boolean',
      group: 'Playback',
      default: true
    })
  })
})

describe('subtitle settings', () => {
  it('start low on the picture, white on a 75% black box, in sans-serif at 5%', () => {
    const defaults = Object.fromEntries(playerSettings.settings.map((setting) => [setting.key, setting.default]))
    expect(defaults[PlayerSettingKey.subtitlePosition]).toBe(3)
    expect(defaults[PlayerSettingKey.subtitleFont]).toBe('sans')
    expect(defaults[PlayerSettingKey.subtitleSize]).toBe(5)
    expect(defaults[PlayerSettingKey.subtitleColor]).toBe('#ffffff')
    expect(defaults[PlayerSettingKey.subtitleBackground]).toBe('#000000')
    expect(defaults[PlayerSettingKey.subtitleBackgroundOpacity]).toBe(75)
  })

  it('all show in the Subtitles section', () => {
    const subtitleKeys = Object.values(PlayerSettingKey).filter((key) => key.startsWith('subtitles.'))
    const groups = playerSettings.settings.filter((setting) => subtitleKeys.includes(setting.key as never)).map((setting) => setting.group)
    expect(groups).toEqual(Array(subtitleKeys.length).fill('Subtitles'))
  })
})
