import { describe, expect, it } from 'vitest'
import { FEED_REFRESH_CHOICES, feedMaxAgeMs, SettingKey, shellSettings } from '../../packages/shell/src/shared/settings'

const HOUR_MS = 60 * 60_000

describe('Refresh New videos setting', () => {
  it('sits under General, offers hours and Off, and refreshes every hour by default', () => {
    const setting = shellSettings.settings.find((definition) => definition.key === SettingKey.feedRefresh)
    expect(setting).toMatchObject({ label: 'Refresh New videos', group: 'General', default: '1' })
    expect(FEED_REFRESH_CHOICES.map((choice) => choice.value)).toEqual(['1', '2', '3', '6', '12', '24', 'off'])
    expect(FEED_REFRESH_CHOICES.map((choice) => choice.label)).toEqual([
      'Every hour', 'Every 2 hours', 'Every 3 hours', 'Every 6 hours', 'Every 12 hours', 'Every 24 hours', 'Off'
    ])
  })

  it('comes right after Open the app at', () => {
    const keys = shellSettings.settings.map((definition) => definition.key)
    expect(keys.indexOf(SettingKey.feedRefresh)).toBe(keys.indexOf(SettingKey.startPage) + 1)
  })

  it('gives the chosen hours as the feed age, and no age for Off', () => {
    expect(feedMaxAgeMs('1')).toBe(HOUR_MS)
    expect(feedMaxAgeMs('2')).toBe(2 * HOUR_MS)
    expect(feedMaxAgeMs('3')).toBe(3 * HOUR_MS)
    expect(feedMaxAgeMs('6')).toBe(6 * HOUR_MS)
    expect(feedMaxAgeMs('12')).toBe(12 * HOUR_MS)
    expect(feedMaxAgeMs('24')).toBe(24 * HOUR_MS)
    expect(feedMaxAgeMs('off')).toBeUndefined()
  })

  it('uses an hour for a value that is not one of the choices', () => {
    expect(feedMaxAgeMs('5')).toBe(HOUR_MS)
    expect(feedMaxAgeMs(undefined)).toBe(HOUR_MS)
  })
})
