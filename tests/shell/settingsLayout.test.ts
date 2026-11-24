import { describe, expect, it } from 'vitest'
import { searchSettings, sectionId, settingsLayout } from '../../packages/shell/src/renderer/modules/settings/layout'
import { installedSettings } from '../../packages/shell/src/shared/settings'

const panels = new Set(['Sync', 'Backup'])

describe('settingsLayout', () => {
  it('shows the sections in their order, with each setting in its group', () => {
    const shown = settingsLayout(installedSettings, panels)
    expect(shown.map((section) => section.title)).toEqual(['Playback', 'Subtitles', 'SponsorBlock', 'Appearance', 'General', 'Sync', 'Backup'])
    const labels = (title: string): string[] => shown.find((section) => section.title === title)?.settings.map((setting) => setting.label) ?? []
    expect(labels('Playback')).toEqual(['Highest automatic quality', 'Move the video to PiP when leaving its page', 'Resume videos where they stopped'])
    expect(labels('Subtitles')).toEqual([
      'Show subtitles when a video starts',
      'Default subtitle language, for example en or de',
      'Subtitle position, in percent of the picture height above its bottom',
      'Subtitle font',
      'Subtitle size, in percent of the picture height',
      'Subtitle text color',
      'Subtitle background color',
      'Subtitle background opacity, in percent, 0 for no background'
    ])
    expect(labels('Appearance')).toEqual(['Theme', 'Accent color'])
    expect(labels('General')).toEqual(['Open the app at', 'Refresh New videos'])
  })

  it('leaves out hidden settings and empty sections, and keeps panels with their section', () => {
    const shown = settingsLayout([
      { title: 'Hidden', settings: [{ key: 'a.b', label: 'Kept by the app', type: 'boolean', default: false, hidden: true }] },
      { title: 'Backup', settings: [] }
    ], panels)
    expect(shown).toEqual([{ title: 'Backup', id: 'settings-backup', settings: [], hasPanel: true }])
  })

  it('makes IDs to jump to', () => {
    expect(sectionId('SponsorBlock')).toBe('settings-sponsorblock')
    expect(sectionId('Sync and backup')).toBe('settings-sync-and-backup')
  })
})

describe('searchSettings', () => {
  const shown = settingsLayout(installedSettings, panels)

  it('shows only the settings that match', () => {
    const found = searchSettings(shown, 'subtitle size')
    expect(found.map((section) => section.title)).toEqual(['Subtitles'])
    expect(found[0]?.settings.map((setting) => setting.label)).toEqual(['Subtitle size, in percent of the picture height'])
  })

  it('shows a whole section whose title matches, and matches choices', () => {
    expect(searchSettings(shown, 'sponsor')[0]?.settings.length).toBeGreaterThan(5)
    expect(searchSettings(shown, 'solarized').map((section) => section.title)).toEqual(['Appearance'])
  })

  it('shows everything for an empty search and nothing for no match', () => {
    expect(searchSettings(shown, '  ')).toEqual(shown)
    expect(searchSettings(shown, 'no such setting')).toEqual([])
  })
})
