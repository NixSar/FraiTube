/** The manifest stored next to the database in every backup. */
export interface BackupManifest {
  format: 'fraitube-backup'
  version: 1
  appVersion: string
  createdAt: number
  /** Each module's table version in the backed up database. */
  modules: Record<string, number>
}
