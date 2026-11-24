import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  downloadPercent,
  isInstallerFor,
  isVersion,
  readRelease,
  showsBanner,
  type UpdateState
} from '../../packages/shell/src/shared/updates'

const DIGEST = 'a'.repeat(64)

function asset(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    browser_download_url: `https://github.com/NixSar/FraiTube/releases/download/v0.9.6/${name}`,
    size: 1000,
    digest: `sha256:${DIGEST}`,
    ...overrides
  }
}

function reply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v0.9.6',
    html_url: 'https://github.com/NixSar/FraiTube/releases/tag/v0.9.6',
    draft: false,
    prerelease: false,
    assets: [asset('FraiTube-0.9.6-setup.exe'), asset('FraiTube-0.9.6-x86_64.AppImage'), asset('latest.yml')],
    ...overrides
  }
}

function available(version: string): UpdateState {
  return { status: 'available', currentVersion: '0.9.0', latest: { version, pageUrl: 'https://github.com/NixSar/FraiTube/releases/tag/v' + version } }
}

describe('versions', () => {
  it('knows a version with or without the v of a tag', () => {
    expect(isVersion('0.9.6')).toBe(true)
    expect(isVersion('v0.9.6')).toBe(true)
    expect(isVersion('1.0.0-beta.1')).toBe(true)
    expect(isVersion('0.9')).toBe(false)
    expect(isVersion('latest')).toBe(false)
    expect(isVersion(96)).toBe(false)
    expect(isVersion('')).toBe(false)
  })

  it('compares by number, not by text', () => {
    expect(compareVersions('0.9.6', '0.9.5')).toBeGreaterThan(0)
    expect(compareVersions('0.9.6', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('v0.9.6', '0.9.6')).toBe(0)
  })

  it('counts a pre-release as older than its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBeLessThan(0)
  })

  it('treats a text that is not a version as equal', () => {
    expect(compareVersions('nonsense', '0.9.6')).toBe(0)
  })
})

describe('the installer for a system', () => {
  it('is the setup on Windows and the AppImage on Linux', () => {
    expect(isInstallerFor('win32', 'FraiTube-0.9.6-setup.exe')).toBe(true)
    expect(isInstallerFor('win32', 'FraiTube-0.9.6-x86_64.AppImage')).toBe(false)
    expect(isInstallerFor('win32', 'FraiTube-0.9.6-setup.exe.blockmap')).toBe(false)
    expect(isInstallerFor('linux', 'FraiTube-0.9.6-x86_64.AppImage')).toBe(true)
    expect(isInstallerFor('linux', 'FraiTube-0.9.6-setup.exe')).toBe(false)
    expect(isInstallerFor('darwin', 'FraiTube-0.9.6.dmg')).toBe(false)
  })
})

describe('readRelease', () => {
  it('reads the version, the page and the file for this system', () => {
    expect(readRelease(reply(), 'win32')).toEqual({
      version: '0.9.6',
      pageUrl: 'https://github.com/NixSar/FraiTube/releases/tag/v0.9.6',
      file: {
        name: 'FraiTube-0.9.6-setup.exe',
        url: 'https://github.com/NixSar/FraiTube/releases/download/v0.9.6/FraiTube-0.9.6-setup.exe',
        size: 1000,
        sha256: DIGEST
      }
    })
    expect(readRelease(reply(), 'linux')?.file?.name).toBe('FraiTube-0.9.6-x86_64.AppImage')
  })

  it('gives the checksum in small letters', () => {
    const release = readRelease(reply({ assets: [asset('FraiTube-0.9.6-setup.exe', { digest: `sha256:${'A'.repeat(64)}` })] }), 'win32')
    expect(release?.file?.sha256).toBe(DIGEST)
  })

  it('skips drafts and pre-releases', () => {
    expect(readRelease(reply({ draft: true }), 'win32')).toBeUndefined()
    expect(readRelease(reply({ prerelease: true }), 'win32')).toBeUndefined()
  })

  it('refuses a reply that is not a release', () => {
    expect(readRelease(undefined, 'win32')).toBeUndefined()
    expect(readRelease('Not Found', 'win32')).toBeUndefined()
    expect(readRelease({ message: 'Not Found' }, 'win32')).toBeUndefined()
    expect(readRelease(reply({ tag_name: 'nightly' }), 'win32')).toBeUndefined()
    expect(readRelease(reply({ html_url: 'https://example.com/releases/tag/v0.9.6' }), 'win32')).toBeUndefined()
  })

  it('leaves out a file without a checksum, from another place, or with a wrong size', () => {
    const name = 'FraiTube-0.9.6-setup.exe'
    const withAsset = (overrides: Record<string, unknown>) => readRelease(reply({ assets: [asset(name, overrides)] }), 'win32')
    expect(withAsset({ digest: undefined })?.file).toBeUndefined()
    expect(withAsset({ digest: 'sha1:abc' })?.file).toBeUndefined()
    expect(withAsset({ browser_download_url: `https://example.com/${name}` })?.file).toBeUndefined()
    expect(withAsset({ size: 0 })?.file).toBeUndefined()
    expect(withAsset({ size: 1.5 })?.file).toBeUndefined()
    expect(withAsset({ digest: undefined })?.version).toBe('0.9.6')
  })

  it('has no file for a system without an installer', () => {
    expect(readRelease(reply(), 'darwin')?.file).toBeUndefined()
    expect(readRelease(reply({ assets: 'none' }), 'win32')?.file).toBeUndefined()
  })
})

describe('showsBanner', () => {
  it('shows a newer version until it is dismissed', () => {
    expect(showsBanner(available('0.9.6'), '')).toBe(true)
    expect(showsBanner(available('0.9.6'), '0.9.6')).toBe(false)
  })

  it('shows again for a version newer than the dismissed one', () => {
    expect(showsBanner(available('0.9.7'), '0.9.6')).toBe(true)
    expect(showsBanner(available('0.9.6'), '0.9.7')).toBe(false)
  })

  it('ignores a dismissed value that is not a version', () => {
    expect(showsBanner(available('0.9.6'), 'nonsense')).toBe(true)
    expect(showsBanner(available('0.9.6'), undefined)).toBe(true)
  })

  it('shows nothing unless a newer version is available', () => {
    expect(showsBanner({ status: 'current', currentVersion: '0.9.6' }, '')).toBe(false)
    expect(showsBanner({ status: 'failed', currentVersion: '0.9.6', error: 'GitHub answered 500' }, '')).toBe(false)
    expect(showsBanner({ status: 'checking', currentVersion: '0.9.6' }, '')).toBe(false)
  })
})

describe('downloadPercent', () => {
  it('gives whole percents, 0 while the size is unknown', () => {
    expect(downloadPercent({ received: 0, total: 0 })).toBe(0)
    expect(downloadPercent({ received: 499, total: 1000 })).toBe(49)
    expect(downloadPercent({ received: 1000, total: 1000 })).toBe(100)
    expect(downloadPercent({ received: 1200, total: 1000 })).toBe(100)
  })
})
