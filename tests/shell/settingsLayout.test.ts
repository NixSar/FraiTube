import { describe, expect, it } from 'vitest'
import { searchSettings, sectionId, settingsLayout } from '../../packages/shell/src/renderer/modules/settings/layout'
import { installedSettings } from '../../packages/shell/src/shared/settings'

const panels = new Set(['Search', 'Sync', 'Backup'])

describe('settingsLayout', () => {
  it('shows the sections in their order, with each setting in its group', () => {
    const shown = settingsLayout(installedSettings, panels)
    expect(shown.map((section) => section.title)).toEqual(['General', 'Content', 'Playback', 'Subtitles', 'SponsorBlock', 'Search', 'Sync', 'Backup'])
    const labels = (title: string): string[] => shown.find((section) => section.title === title)?.settings.map((setting) => setting.label) ?? []
    expect(labels('General')).toEqual(['Open the app at', 'Theme', 'Accent color', 'Check for updates when FraiTube starts'])
    expect(labels('Content')).toEqual(['Show Shorts', 'Refresh New videos'])
    expect(labels('Playback')).toEqual(['Default quality', 'Resume videos where they stopped', 'Move the video to PiP when leaving its page'])
    expect(labels('Subtitles')).toEqual([
      'Show subtitles when a video starts',
      'Default subtitle language, for example en or de',
      'Subtitle font',
      'Subtitle size, in percent of the picture height',
      'Subtitle text color',
      'Subtitle background color',
      'Subtitle background opacity, in percent, 0 for no background',
      'Subtitle position, in percent of the picture height above its bottom'
    ])
    expect(labels('SponsorBlock')[0]).toBe('Use SponsorBlock')
    expect(labels('SponsorBlock').at(-1)).toBe('Server address')
    expect(labels('Search')).toEqual(['Suggest searches while typing', 'Remember searches', 'Searches kept'])
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
    expect(searchSettings(shown, 'solarized').map((section) => section.title)).toEqual(['General'])
  })

  it('shows everything for an empty search and nothing for no match', () => {
    expect(searchSettings(shown, '  ')).toEqual(shown)
    expect(searchSettings(shown, 'no such setting')).toEqual([])
  })
})
