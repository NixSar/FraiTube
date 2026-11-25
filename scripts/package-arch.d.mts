export function packageFor(processorArch: string): {
  arch: 'x64' | 'arm64'
  config?: {
    nsis: { artifactName: string }
    appImage: { artifactName: string }
  }
}
