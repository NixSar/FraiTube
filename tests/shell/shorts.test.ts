import { describe, expect, it } from 'vitest'
import { allSettingDefinitions, SettingKey, shortsShown, withoutHiddenShorts } from '../../packages/shell/src/shared/settings'

describe('Show Shorts setting', () => {
  it('is in General, off by default, and synced like the other settings', () => {
    const setting = allSettingDefinitions().find((definition) => definition.key === SettingKey.showShorts)
    expect(setting).toMatchObject({ label: 'Show Shorts', group: 'General', type: 'boolean', default: false })
    expect(setting && 'local' in setting ? setting.local : undefined).toBeUndefined()
  })

  it('shows shorts only once it is turned on', () => {
    expect(shortsShown(true)).toBe(true)
    expect(shortsShown(false)).toBe(false)
    expect(shortsShown(undefined)).toBe(false)
    expect(shortsShown('true')).toBe(false)
  })
})

describe('withoutHiddenShorts', () => {
  const items = [{ id: 'video' }, { id: 'short', short: true }, { id: 'old', short: false }]

  it('leaves out the entries marked as shorts while shorts do not show', () => {
    expect(withoutHiddenShorts(items, false).map((item) => item.id)).toEqual(['video', 'old'])
  })

  it('keeps every entry while shorts show', () => {
    expect(withoutHiddenShorts(items, true).map((item) => item.id)).toEqual(['video', 'short', 'old'])
  })
})
