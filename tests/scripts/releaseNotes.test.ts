import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { androidVersionCode, changelogEntry, checkAndroidVersionCode, checkVersions, tagVersion, VERSIONED_FILES } from '../../scripts/release-notes.mjs'

const changelog = [
  '# Changelog',
  '',
  '## 0.9.0 - 2026-12-15',
  '',
  '- Faster start.',
  '',
  '## 0.8.0 - 2026-11-23',
  '',
  'The first version.',
  '',
  '- Search.',
  ''
].join('\n')

describe('tagVersion', () => {
  it('reads the version from a release tag', () => {
    expect(tagVersion('v0.8.0')).toBe('0.8.0')
    expect(tagVersion('v1.2.3-beta.1')).toBe('1.2.3-beta.1')
  })

  it('refuses anything that is not a version tag', () => {
    expect(() => tagVersion('0.8.0')).toThrow('not a version tag')
    expect(() => tagVersion('v0.1')).toThrow('not a version tag')
    expect(() => tagVersion('vnext')).toThrow('not a version tag')
  })
})

describe('checkVersions', () => {
  it('passes when every file has the tag\'s version', () => {
    expect(() => checkVersions('0.8.0', [{ file: 'package.json', version: '0.8.0' }])).not.toThrow()
  })

  it('stops the release when a file has another version', () => {
    expect(() => checkVersions('0.9.0', [
      { file: 'package.json', version: '0.9.0' },
      { file: 'packages/shell/package.json', version: '0.8.0' }
    ])).toThrow('packages/shell/package.json has version 0.8.0, the tag has 0.9.0')
  })

  it('checks the versions the app states today', () => {
    const versions = VERSIONED_FILES.map((file) => ({
      file,
      version: (JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')) as { version: string }).version
    }))
    expect(VERSIONED_FILES).toEqual(['package.json', 'packages/shell/package.json'])
    expect(() => checkVersions(versions[0]?.version ?? '', versions)).not.toThrow()
  })
})

describe('checkAndroidVersionCode', () => {
  it('gives every newer version a higher number', () => {
    expect(androidVersionCode('0.9.10')).toBe(9010)
    expect(androidVersionCode('1.0.0')).toBe(1000000)
    expect(androidVersionCode('1.2.3-beta.1')).toBe(1002003)
  })

  it('stops the release when the number does not fit the version', () => {
    expect(() => checkAndroidVersionCode('1.0.1', 1000001)).not.toThrow()
    expect(() => checkAndroidVersionCode('1.0.1', 1000000)).toThrow('package.json has androidVersionCode 1000000, version 1.0.1 needs 1000001')
  })

  it('checks the number package.json states today', () => {
    const { version, androidVersionCode: stated } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string, androidVersionCode: number }
    expect(() => checkAndroidVersionCode(version, stated)).not.toThrow()
  })
})

describe('changelogEntry', () => {
  it('gives the entry of the version, up to the next version', () => {
    expect(changelogEntry(changelog, '0.9.0')).toBe('- Faster start.')
    expect(changelogEntry(changelog, '0.8.0')).toBe('The first version.\n\n- Search.')
  })

  it('reads a changelog with Windows line ends', () => {
    expect(changelogEntry(changelog.replaceAll('\n', '\r\n'), '0.9.0')).toBe('- Faster start.')
  })

  it('stops the release when the version has no entry or an empty one', () => {
    expect(() => changelogEntry(changelog, '1.0.0')).toThrow('no entry for 1.0.0')
    expect(() => changelogEntry('## 1.0.0\n\n## 0.9.0\n- x', '1.0.0')).toThrow('entry for 1.0.0 is empty')
  })

  it('finds the entry of the current version in CHANGELOG.md', () => {
    const current = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version
    expect(changelogEntry(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'), current)).not.toBe('')
  })
})
