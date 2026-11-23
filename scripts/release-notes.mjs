import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run by the release job: node scripts/release-notes.mjs <tag> <notes file>
// Checks that the tag matches the app's version, writes that version's CHANGELOG entry to the notes file
// and prints the version.

/** Files whose version a release tag must match. */
export const VERSIONED_FILES = ['package.json', 'packages/shell/package.json']

/** The version a release tag names: v0.8.0 names 0.8.0. */
export function tagVersion(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag)
  if (!match) {
    throw new Error(`${tag} is not a version tag such as v0.8.0`)
  }
  return match[1]
}

/** Stops when a file states another version than the tag. */
export function checkVersions(version, files) {
  for (const { file, version: stated } of files) {
    if (stated !== version) {
      throw new Error(`${file} has version ${stated}, the tag has ${version}`)
    }
  }
}

/** The CHANGELOG entry of a version, without its heading. */
export function changelogEntry(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} `))
  if (start < 0) {
    throw new Error(`CHANGELOG.md has no entry for ${version}`)
  }
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const entry = lines.slice(start + 1, next < 0 ? lines.length : next).join('\n').trim()
  if (!entry) {
    throw new Error(`The CHANGELOG.md entry for ${version} is empty`)
  }
  return entry
}

if (import.meta.main) {
  const [tag = '', notesFile] = process.argv.slice(2)
  if (!notesFile) {
    throw new Error('Usage: node scripts/release-notes.mjs <tag> <notes file>')
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  const version = tagVersion(tag)
  checkVersions(version, VERSIONED_FILES.map((file) => ({
    file,
    version: JSON.parse(readFileSync(join(root, file), 'utf8')).version
  })))
  writeFileSync(notesFile, `${changelogEntry(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version)}\n`)
  console.log(version)
}
