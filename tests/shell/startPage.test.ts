import { describe, expect, it } from 'vitest'
import { SettingKey, shellSettings, START_PAGES, startPageRoute } from '../../packages/shell/src/shared/settings'

describe('start page', () => {
  it('offers every tab except Settings, Subscriptions by default', () => {
    expect(START_PAGES.map((page) => page.value)).toEqual(['subscriptions', 'channels', 'history'])
    expect(shellSettings.settings.find((setting) => setting.key === SettingKey.startPage)?.default).toBe('subscriptions')
  })

  it('opens at the chosen tab, or Subscriptions for anything else', () => {
    expect(startPageRoute('history')).toBe('history')
    expect(startPageRoute('settings')).toBe('subscriptions')
    expect(startPageRoute(undefined)).toBe('subscriptions')
  })
})
