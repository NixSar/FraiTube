/** Where the latest FraiTube release is asked for, and where its files must come from. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/NixSar/FraiTube/releases/latest'
const RELEASE_PAGE_PREFIX = 'https://github.com/NixSar/FraiTube/releases/'
const RELEASE_FILE_PREFIX = 'https://github.com/NixSar/FraiTube/releases/download/'

/** The installer file of a release for this system and processor, with the SHA-256 GitHub lists for it. */
export interface UpdateFile {
  name: string
  url: string
  size: number
  /** In small letters. */
  sha256: string
}

/** The latest release: its version, its page, and its file for this system when it has one GitHub lists a checksum for. */
export interface Release {
  version: string
  pageUrl: string
  file?: UpdateFile
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'failed'
  /** The version running here. */
  currentVersion: string
  /** The latest release, once a check found one. */
  latest?: Release
  error?: string
}

export interface DownloadState {
  status: 'idle' | 'downloading' | 'done' | 'failed'
  /** The version being downloaded or downloaded. */
  version?: string
  received: number
  total: number
  /** What the downloaded file offers: installing on Windows, showing it in its folder on Linux. */
  action: 'install' | 'show'
  error?: string
}

interface Version {
  core: [number, number, number]
  preRelease: string
}

function parseVersion(text: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text)
  if (!match) {
    return undefined
  }
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], preRelease: match[4] ?? '' }
}

/** Whether a text is a version such as 0.9.6, with or without the v of a tag. */
export function isVersion(text: unknown): text is string {
  return typeof text === 'string' && text.length <= 40 && parseVersion(text) !== undefined
}

/** Below 0 when a is older than b, above 0 when it is newer, 0 when they are the same or either is not a version. A pre-release is older than its release. */
export function compareVersions(a: string, b: string): number {
  const first = parseVersion(a)
  const second = parseVersion(b)
  if (!first || !second) {
    return 0
  }
  for (let index = 0; index < 3; index++) {
    const difference = first.core[index]! - second.core[index]!
    if (difference !== 0) {
      return difference
    }
  }
  if (first.preRelease === second.preRelease) {
    return 0
  }
  if (!first.preRelease || !second.preRelease) {
    return first.preRelease ? -1 : 1
  }
  return first.preRelease < second.preRelease ? -1 : 1
}

/** The name of each installer, by system and processor: the setup on Windows, the AppImage on Linux. */
const INSTALLER_NAMES: Record<string, Record<string, RegExp>> = {
  win32: {
    x64: /^FraiTube-[\w.-]+-setup\.exe$/,
    arm64: /^FraiTube-[\w.-]+-setup-arm64\.exe$/
  },
  linux: {
    x64: /^FraiTube-[\w.-]+-x86_64\.AppImage$/,
    arm64: /^FraiTube-[\w.-]+-aarch64\.AppImage$/
  }
}

/** Which release file is the installer for a system and processor. */
export function isInstallerFor(platform: string, arch: string, name: string): boolean {
  return INSTALLER_NAMES[platform]?.[arch]?.test(name) === true
}

function readFile(asset: unknown, platform: string, arch: string): UpdateFile | undefined {
  if (typeof asset !== 'object' || asset === null) {
    return undefined
  }
  const { name, browser_download_url: url, size, digest } = asset as Record<string, unknown>
  const sha256 = typeof digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(digest)?.[1] : undefined
  if (typeof name !== 'string' || !isInstallerFor(platform, arch, name) || typeof url !== 'string' || !url.startsWith(RELEASE_FILE_PREFIX) ||
    typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || !sha256) {
    return undefined
  }
  return { name, url, size, sha256: sha256.toLowerCase() }
}

/**
 * The release in GitHub's reply about the latest release, with its file for this system and processor,
 * or undefined when the reply is not one, or is a draft or pre-release.
 */
export function readRelease(reply: unknown, platform: string, arch: string): Release | undefined {
  if (typeof reply !== 'object' || reply === null) {
    return undefined
  }
  const { tag_name: tag, html_url: pageUrl, draft, prerelease, assets } = reply as Record<string, unknown>
  if (!isVersion(tag) || typeof pageUrl !== 'string' || !pageUrl.startsWith(RELEASE_PAGE_PREFIX) || draft === true || prerelease === true) {
    return undefined
  }
  const file = Array.isArray(assets) ? assets.map((asset) => readFile(asset, platform, arch)).find((found) => found !== undefined) : undefined
  return { version: tag.replace(/^v/, ''), pageUrl, ...(file && { file }) }
}

/** Whether the banner shows: a newer version was found, and it is newer than the one whose banner was dismissed. */
export function showsBanner(state: UpdateState, dismissedVersion: unknown): boolean {
  const latest = state.latest
  if (state.status !== 'available' || !latest) {
    return false
  }
  return !isVersion(dismissedVersion) || compareVersions(latest.version, dismissedVersion) > 0
}

/** Whole percent of a download, 0 while its size is unknown. */
export function downloadPercent(state: Pick<DownloadState, 'received' | 'total'>): number {
  return state.total > 0 ? Math.min(100, Math.floor((state.received / state.total) * 100)) : 0
}
