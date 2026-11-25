/**
 * What the app is packed for on a processor: its electron-builder arch, and for ARM64 the names of its
 * files. The x64 files keep the names in electron-builder.yml. The Windows ARM64 name does not end in
 * "-setup.exe", so the update check of FraiTube 0.9.7 and 0.9.8 never takes it for the x64 installer.
 */
export function packageFor(processorArch) {
  if (processorArch === 'x64') {
    return { arch: 'x64' }
  }
  if (processorArch === 'arm64') {
    return {
      arch: 'arm64',
      config: {
        nsis: { artifactName: '${productName}-${version}-setup-arm64.${ext}' },
        appImage: { artifactName: '${productName}-${version}-aarch64.${ext}' }
      }
    }
  }
  throw new Error(`FraiTube is packed for x64 and ARM64 processors, not ${processorArch}`)
}
