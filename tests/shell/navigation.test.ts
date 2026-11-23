import { describe, expect, it } from 'vitest'
import { staysOnPage } from '../../packages/shell/src/shared/navigation'

describe('staysOnPage', () => {
  const appPage = 'file:///D:/FraiTube/resources/app/out/renderer/index.html#/subscriptions'

  it('allows the app page itself, whatever in-app path it shows', () => {
    expect(staysOnPage('file:///D:/FraiTube/resources/app/out/renderer/index.html#/watch/l8qxFcaLSM4?t=347', appPage)).toBe(true)
    expect(staysOnPage('file:///D:/FraiTube/resources/app/out/renderer/index.html', appPage)).toBe(true)
    expect(staysOnPage('http://localhost:5173/#/settings', 'http://localhost:5173/#/subscriptions')).toBe(true)
  })

  it('refuses a file dropped on the window and any other address', () => {
    expect(staysOnPage('file:///D:/FraiTube/notes/page.html', appPage)).toBe(false)
    expect(staysOnPage('file:///D:/FraiTube/resources/app/out/renderer/other.html#/subscriptions', appPage)).toBe(false)
    expect(staysOnPage('https://www.youtube.com/', appPage)).toBe(false)
    expect(staysOnPage('http://localhost:5173/other', 'http://localhost:5173/#/subscriptions')).toBe(false)
    expect(staysOnPage('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
  })

  it('refuses an address that cannot be read', () => {
    expect(staysOnPage('not an address', appPage)).toBe(false)
    expect(staysOnPage(appPage, '')).toBe(false)
  })
})
