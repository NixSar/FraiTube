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
    // In the order a release uploads them: the x64 files first, then the ARM64 files.
    assets: [
      asset('FraiTube-0.9.6-setup.exe'),
      asset('FraiTube-0.9.6-x86_64.AppImage'),
      asset('FraiTube-0.9.6-setup-arm64.exe'),
      asset('FraiTube-0.9.6-aarch64.AppImage'),
      asset('latest.yml')
    ],
    ...overrides
  }
}

/** The installer names the update check of FraiTube 0.9.7 and 0.9.8 takes, which knows no processors. */
const OLD_CHECK: Record<string, RegExp> = {
  win32: /^FraiTube-[\w.-]+-setup\.exe$/,
  linux: /^FraiTube-[\w.-]+\.AppImage$/
}

/** The file the 0.9.7 and 0.9.8 update check takes from a release: the first whose name fits its system. */
function oldCheckPicks(platform: string, names: string[]): string | undefined {
  return names.find((name) => OLD_CHECK[platform]!.test(name))
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

describe('the installer for a system and processor', () => {
  it('is the setup on Windows and the AppImage on Linux, for x64', () => {
    expect(isInstallerFor('win32', 'x64', 'FraiTube-0.9.6-setup.exe')).toBe(true)
    expect(isInstallerFor('win32', 'x64', 'FraiTube-0.9.6-x86_64.AppImage')).toBe(false)
    expect(isInstallerFor('win32', 'x64', 'FraiTube-0.9.6-setup.exe.blockmap')).toBe(false)
    expect(isInstallerFor('linux', 'x64', 'FraiTube-0.9.6-x86_64.AppImage')).toBe(true)
    expect(isInstallerFor('linux', 'x64', 'FraiTube-0.9.6-setup.exe')).toBe(false)
  })

  it('is the ARM64 setup or AppImage for ARM64', () => {
    expect(isInstallerFor('win32', 'arm64', 'FraiTube-0.9.6-setup-arm64.exe')).toBe(true)
    expect(isInstallerFor('linux', 'arm64', 'FraiTube-0.9.6-aarch64.AppImage')).toBe(true)
  })

  it('never takes the other processor\'s file', () => {
    expect(isInstallerFor('win32', 'x64', 'FraiTube-0.9.6-setup-arm64.exe')).toBe(false)
    expect(isInstallerFor('win32', 'arm64', 'FraiTube-0.9.6-setup.exe')).toBe(false)
    expect(isInstallerFor('linux', 'x64', 'FraiTube-0.9.6-aarch64.AppImage')).toBe(false)
    expect(isInstallerFor('linux', 'arm64', 'FraiTube-0.9.6-x86_64.AppImage')).toBe(false)
  })

  it('has none for another system or processor', () => {
    expect(isInstallerFor('darwin', 'arm64', 'FraiTube-0.9.6.dmg')).toBe(false)
    expect(isInstallerFor('win32', 'ia32', 'FraiTube-0.9.6-setup.exe')).toBe(false)
    expect(isInstallerFor('toString', 'x64', 'FraiTube-0.9.6-setup.exe')).toBe(false)
  })
})

describe('the update check of FraiTube 0.9.7 and 0.9.8', () => {
  const names = (reply().assets as { name: string }[]).map((found) => found.name)

  it('never takes the Windows ARM64 installer', () => {
    expect(OLD_CHECK['win32']!.test('FraiTube-0.9.6-setup-arm64.exe')).toBe(false)
    expect(oldCheckPicks('win32', names)).toBe('FraiTube-0.9.6-setup.exe')
  })

  it('takes the x64 AppImage, since a release uploads it before the ARM64 one', () => {
    expect(oldCheckPicks('linux', names)).toBe('FraiTube-0.9.6-x86_64.AppImage')
  })
})

describe('readRelease', () => {
  it('reads the version, the page and the file for this system and processor', () => {
    expect(readRelease(reply(), 'win32', 'x64')).toEqual({
      version: '0.9.6',
      pageUrl: 'https://github.com/NixSar/FraiTube/releases/tag/v0.9.6',
      file: {
        name: 'FraiTube-0.9.6-setup.exe',
        url: 'https://github.com/NixSar/FraiTube/releases/download/v0.9.6/FraiTube-0.9.6-setup.exe',
        size: 1000,
        sha256: DIGEST
      }
    })
    expect(readRelease(reply(), 'linux', 'x64')?.file?.name).toBe('FraiTube-0.9.6-x86_64.AppImage')
    expect(readRelease(reply(), 'win32', 'arm64')?.file?.name).toBe('FraiTube-0.9.6-setup-arm64.exe')
    expect(readRelease(reply(), 'linux', 'arm64')?.file?.name).toBe('FraiTube-0.9.6-aarch64.AppImage')
  })

  it('has no file for ARM64 in a release with only x64 files', () => {
    const x64Only = reply({ assets: [asset('FraiTube-0.9.6-setup.exe'), asset('FraiTube-0.9.6-x86_64.AppImage')] })
    expect(readRelease(x64Only, 'win32', 'arm64')?.file).toBeUndefined()
    expect(readRelease(x64Only, 'win32', 'arm64')?.version).toBe('0.9.6')
  })

  it('gives the checksum in small letters', () => {
    const release = readRelease(reply({ assets: [asset('FraiTube-0.9.6-setup.exe', { digest: `sha256:${'A'.repeat(64)}` })] }), 'win32', 'x64')
    expect(release?.file?.sha256).toBe(DIGEST)
  })

  it('skips drafts and pre-releases', () => {
    expect(readRelease(reply({ draft: true }), 'win32', 'x64')).toBeUndefined()
    expect(readRelease(reply({ prerelease: true }), 'win32', 'x64')).toBeUndefined()
  })

  it('refuses a reply that is not a release', () => {
    expect(readRelease(undefined, 'win32', 'x64')).toBeUndefined()
    expect(readRelease('Not Found', 'win32', 'x64')).toBeUndefined()
    expect(readRelease({ message: 'Not Found' }, 'win32', 'x64')).toBeUndefined()
    expect(readRelease(reply({ tag_name: 'nightly' }), 'win32', 'x64')).toBeUndefined()
    expect(readRelease(reply({ html_url: 'https://example.com/releases/tag/v0.9.6' }), 'win32', 'x64')).toBeUndefined()
  })

  it('leaves out a file without a checksum, from another place, or with a wrong size', () => {
    const name = 'FraiTube-0.9.6-setup.exe'
    const withAsset = (overrides: Record<string, unknown>) => readRelease(reply({ assets: [asset(name, overrides)] }), 'win32', 'x64')
    expect(withAsset({ digest: undefined })?.file).toBeUndefined()
    expect(withAsset({ digest: 'sha1:abc' })?.file).toBeUndefined()
    expect(withAsset({ browser_download_url: `https://example.com/${name}` })?.file).toBeUndefined()
    expect(withAsset({ size: 0 })?.file).toBeUndefined()
    expect(withAsset({ size: 1.5 })?.file).toBeUndefined()
    expect(withAsset({ digest: undefined })?.version).toBe('0.9.6')
  })

  it('has no file for a system without an installer', () => {
    expect(readRelease(reply(), 'darwin', 'arm64')?.file).toBeUndefined()
    expect(readRelease(reply({ assets: 'none' }), 'win32', 'x64')?.file).toBeUndefined()
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
