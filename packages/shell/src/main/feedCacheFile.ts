import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { readSavedFeed, type FeedCache } from './feed'

/**
 * Keeps the fetched feed in a file. It is read once when the app starts; each save replaces the file
 * whole, one after another, and a save that fails leaves the last one.
 */
export function createFeedCacheFile(file: string): FeedCache {
  let saving: Promise<void> = Promise.resolve()
  return {
    load() {
      try {
        return readSavedFeed(readFileSync(file, 'utf8'))
      } catch {
        return undefined
      }
    },
    save(feed) {
      const text = JSON.stringify(feed)
      saving = saving.then(async () => {
        const temporary = `${file}.tmp`
        await writeFile(temporary, text, 'utf8')
        await rename(temporary, file)
      }).catch(() => undefined)
    }
  }
}
