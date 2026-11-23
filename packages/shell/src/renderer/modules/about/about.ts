/** What the About page says about the app, and where its links go. */
export const ABOUT = {
  description: 'A desktop YouTube app for Windows and Linux that needs no Google account.',
  license: 'AGPL-3.0-or-later',
  licenseUrl: 'https://github.com/NixSar/FraiTube/blob/main/LICENSE',
  repositoryUrl: 'https://github.com/NixSar/FraiTube',
  issuesUrl: 'https://github.com/NixSar/FraiTube/issues'
} as const

/** The open-source projects FraiTube is built on, with their homes. */
export const CREDITS: readonly { name: string; url: string; does: string }[] = [
  { name: 'Electron', url: 'https://www.electronjs.org', does: 'the desktop app' },
  { name: 'Vue', url: 'https://vuejs.org', does: 'the pages' },
  { name: 'YouTube.js', url: 'https://github.com/LuanRT/YouTube.js', does: 'talking to YouTube' },
  { name: 'googlevideo', url: 'https://github.com/LuanRT/googlevideo', does: 'video streaming' },
  { name: 'BgUtils', url: 'https://github.com/LuanRT/BgUtils', does: 'proof of origin tokens' },
  { name: 'SponsorBlock', url: 'https://sponsor.ajay.app', does: 'skipping sponsor segments' },
  { name: '7-Zip', url: 'https://www.7-zip.org', does: 'backups and NewPipe imports' }
]
