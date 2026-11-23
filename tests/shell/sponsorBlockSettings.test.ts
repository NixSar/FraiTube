import { describe, expect, it } from 'vitest'
import { checkSettingDefinitions } from '../../packages/app-api/src/settings'
import { allSettingDefinitions } from '../../packages/shell/src/shared/settings'
import {
  categoryModes,
  categorySettingKey,
  SponsorBlockSettingKey,
  sponsorBlockSettings
} from '../../packages/shell/src/shared/sponsorBlockSettings'

describe('SponsorBlock settings', () => {
  it('are off by default, with the public server, Skip for sponsors and Off for the rest', () => {
    const defaults = Object.fromEntries(sponsorBlockSettings.settings.map((setting) => [setting.key, setting.default]))
    expect(sponsorBlockSettings.title).toBe('SponsorBlock')
    expect(defaults[SponsorBlockSettingKey.enabled]).toBe(false)
    expect(defaults[SponsorBlockSettingKey.server]).toBe('https://sponsor.ajay.app')
    expect(categoryModes((key) => defaults[key] as string | undefined)).toEqual({
      sponsor: 'skip',
      selfpromo: 'off',
      interaction: 'off',
      intro: 'off',
      outro: 'off',
      preview: 'off',
      music_offtopic: 'off',
      filler: 'off'
    })
  })

  it('use valid keys that clash with no other setting', () => {
    expect(categorySettingKey('music_offtopic')).toBe('sponsorBlock.category.musicOfftopic')
    expect(() => checkSettingDefinitions(allSettingDefinitions())).not.toThrow()
  })

  it('fall back to the default for a value that is not a choice', () => {
    const modes = categoryModes((key) => (key === categorySettingKey('sponsor') ? 'maybe' : 'show'))
    expect(modes.sponsor).toBe('skip')
    expect(modes.intro).toBe('show')
  })
})
