/**
 * The AppImage file the app runs from, or undefined for any other install. An AppImage restarts by starting
 * this file again, because everything inside it, Electron's own restart helper included, is mounted only
 * while it runs and is gone once it quits.
 */
export function appImageFile(env: Readonly<Record<string, string | undefined>>): string | undefined {
  return env['APPIMAGE'] || undefined
}
