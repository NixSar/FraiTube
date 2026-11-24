import { describe, expect, it } from 'vitest'
import {
  nearestHeight,
  playerSettings,
  PlayerSettingKey,
  readDefaultQuality,
  startingQuality
} from '../../packages/shell/src/shared/playerSettings'

describe('the Default quality setting', () => {
  it('offers Max, every YouTube quality and Auto, with 1080p by default', () => {
    const setting = playerSettings.settings.find((found) => found.key === PlayerSettingKey.defaultQuality)
    expect(setting).toMatchObject({ label: 'Default quality', type: 'choice', default: '1080' })
    expect(setting?.type === 'choice' ? setting.options.map((option) => option.label) : []).toEqual([
      'Max', '4320p', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p', 'Auto, fits the player'
    ])
  })
})

describe('readDefaultQuality', () => {
  it('reads Max, Auto and each quality, and 1080p for any other value', () => {
    expect(readDefaultQuality('max')).toBe('max')
    expect(readDefaultQuality('auto')).toBe('auto')
    expect(readDefaultQuality('1440')).toBe(1440)
    expect(readDefaultQuality('4320')).toBe(4320)
    expect(readDefaultQuality('1000')).toBe(1080)
    expect(readDefaultQuality(undefined)).toBe(1080)
    expect(readDefaultQuality(true)).toBe(1080)
  })
})

describe('nearestHeight', () => {
  it('picks the nearest quality, and the lower one when two are equally near', () => {
    expect(nearestHeight(1440, [2160, 1080, 720])).toBe(1080)
    expect(nearestHeight(1440, [2160, 360])).toBe(2160)
    expect(nearestHeight(1440, [2160, 720])).toBe(720)
    expect(nearestHeight(720, [1080, 360])).toBe(360)
    expect(nearestHeight(600, [720, 480])).toBe(480)
    expect(nearestHeight(144, [1080, 720])).toBe(720)
    expect(nearestHeight(1080, [])).toBeUndefined()
  })
})

describe('startingQuality', () => {
  const heights = [2160, 1440, 1080, 720, 480, 360, 240, 144]

  it('starts at the chosen quality when the video has it', () => {
    expect(startingQuality(1440, heights)).toBe(1440)
    expect(startingQuality(720, heights)).toBe(720)
  })

  it('starts at the nearest quality the video has', () => {
    expect(startingQuality(1440, [1080, 720, 480])).toBe(1080)
    expect(startingQuality(4320, heights)).toBe(2160)
  })

  it('starts at the highest quality for Max', () => {
    expect(startingQuality('max', heights)).toBe(2160)
    expect(startingQuality('max', [720, 1080, 480])).toBe(1080)
  })

  it('leaves the quality to the player size for Auto and for a video with no qualities listed', () => {
    expect(startingQuality('auto', heights)).toBe('auto')
    expect(startingQuality(1080, [])).toBe('auto')
    expect(startingQuality('max', [])).toBe('auto')
  })
})
