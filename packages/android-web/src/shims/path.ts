/** Stand-in for the part of Node's path module the sync engine uses: joining names into a path. */
export function join(...parts: string[]): string {
  const names: string[] = []
  for (const name of parts.join('/').split('/')) {
    if (name === '..') {
      names.pop()
    } else if (name !== '' && name !== '.') {
      names.push(name)
    }
  }
  return names.join('/')
}
