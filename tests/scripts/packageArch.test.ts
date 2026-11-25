import { describe, expect, it } from 'vitest'
import { packageFor } from '../../scripts/package-arch.mjs'

describe('packageFor', () => {
  it('packs x64 under the names in electron-builder.yml', () => {
    expect(packageFor('x64')).toEqual({ arch: 'x64' })
  })

  it('packs ARM64 under its own names', () => {
    expect(packageFor('arm64')).toEqual({
      arch: 'arm64',
      config: {
        nsis: { artifactName: '${productName}-${version}-setup-arm64.${ext}' },
        appImage: { artifactName: '${productName}-${version}-aarch64.${ext}' }
      }
    })
  })

  it('stops for another processor', () => {
    expect(() => packageFor('ia32')).toThrow('not ia32')
  })
})
