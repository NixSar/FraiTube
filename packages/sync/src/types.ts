/** One change of one record, as written into a sync file. */
export interface SyncChange {
  table: string
  key: string
  /** The record's data as stored, JSON text, or null for a removal marker. */
  data: string | null
  changedAt: number
  removed: boolean
}

/** The content of one compressed sync file. */
export interface SyncFile {
  format: 'fraitube-sync'
  version: 1
  /** The computer that wrote the file and made every change in it. */
  computerId: string
  createdAt: number
  changes: SyncChange[]
}

/** What one sync run did. */
export interface SyncResult {
  /** Own changes written for the other computers. */
  sent: number
  /** Changes from other computers that won and were applied. */
  received: number
  /** Other computers whose folders were found. */
  computers: number
  /** Files of other computers that could not be read, for example while they are still arriving. */
  unreadable: number
  /** Keys whose records changed in each table, so open windows can be told. */
  changedKeys: Record<string, string[]>
}
