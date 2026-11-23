import { describe, expect, it } from 'vitest'
import { appImageFile } from '../../packages/shell/src/main/relaunch'

describe('appImageFile', () => {
  it('names the AppImage the app runs from, so a restart starts that file again', () => {
    expect(appImageFile({ APPIMAGE: '/opt/apps/FraiTube-0.8.0-x86_64.AppImage' })).toBe('/opt/apps/FraiTube-0.8.0-x86_64.AppImage')
  })

  it('names nothing for any other install, which restarts the usual way', () => {
    expect(appImageFile({})).toBeUndefined()
    expect(appImageFile({ APPIMAGE: '' })).toBeUndefined()
  })
})
