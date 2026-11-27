/** Stands in for Node's crypto module, with the one function the YouTube package uses. */
export function randomUUID(): string {
  return crypto.randomUUID()
}
