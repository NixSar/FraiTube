import type { ModuleSchema } from '@fraitube/storage'
import { isSevenZip, packArchive, unpackArchive } from './archive'
import type { BackupManifest } from './types'

export const DATABASE_FILE = 'fraitube.db'
export const MANIFEST_FILE = 'manifest.json'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** The suggested backup file name, in local time, for example FraiTube-backup-2026-11-22-1830.zip. */
export function backupFileName(date: Date): string {
  return `FraiTube-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`
}

/** The manifest of a backup made now by the given app version, of a database with the given table versions. */
export function backupManifest(appVersion: string, modules: Record<string, number>, createdAt: number): BackupManifest {
  return { format: 'fraitube-backup', version: 1, appVersion, createdAt, modules }
}

/** Makes a zip archive of a database copy and its manifest. */
export function packBackup(manifest: BackupManifest, database: Uint8Array): Uint8Array {
  return packArchive([
    { name: MANIFEST_FILE, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
    { name: DATABASE_FILE, data: database }
  ])
}

function isManifest(value: unknown): value is BackupManifest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const manifest = value as Partial<BackupManifest>
  return manifest.format === 'fraitube-backup' &&
    manifest.version === 1 &&
    typeof manifest.appVersion === 'string' &&
    typeof manifest.createdAt === 'number' &&
    typeof manifest.modules === 'object' && manifest.modules !== null &&
    Object.values(manifest.modules).every((version) => Number.isSafeInteger(version) && version >= 0)
}

/** Throws when a module in the backup is at a newer table version than this app knows. */
export function checkManifest(manifest: BackupManifest, schemas: readonly ModuleSchema[]): void {
  for (const schema of schemas) {
    const version = manifest.modules[schema.module] ?? 0
    if (version > schema.migrations.length) {
      throw new Error(`This backup comes from a newer FraiTube version (${manifest.appVersion})`)
    }
  }
}

/** Reads a backup archive. Throws for a file that is not a FraiTube backup. */
export function readBackup(archive: Uint8Array): { manifest: BackupManifest; database: Uint8Array } {
  if (isSevenZip(archive)) {
    throw new Error('This backup was made by FraiTube 0.9.10 or older. Restore it with version 0.9.10.')
  }
  let files
  try {
    files = unpackArchive(archive, [MANIFEST_FILE, DATABASE_FILE])
  } catch {
    throw new Error('This file is not a FraiTube backup')
  }
  const manifestFile = files.find((file) => file.name === MANIFEST_FILE)
  const database = files.find((file) => file.name === DATABASE_FILE)
  let manifest: unknown
  try {
    manifest = manifestFile ? JSON.parse(new TextDecoder().decode(manifestFile.data)) : undefined
  } catch {
    manifest = undefined
  }
  if (!isManifest(manifest) || !database) {
    throw new Error('This file is not a FraiTube backup')
  }
  return { manifest, database: database.data }
}
