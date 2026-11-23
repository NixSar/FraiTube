/** One version of a record: when it changed and which computer made the change. */
export interface RecordVersion {
  changedAt: number
  computerId: string
}

/**
 * Returns true when the incoming version wins over the current one: it changed later, or at the same
 * time on a computer with a higher ID, so every computer picks the same winner.
 */
export function isNewer(incoming: RecordVersion, current: RecordVersion | undefined): boolean {
  if (!current) {
    return true
  }
  if (incoming.changedAt !== current.changedAt) {
    return incoming.changedAt > current.changedAt
  }
  return incoming.computerId > current.computerId
}
