import { readFile, rm, writeFile } from 'node:fs/promises'

/** The system's own encryption, which only this user on this computer can undo. */
export interface SystemEncryption {
  /** False where the system offers no real encryption, as on a Linux desktop without a keyring. */
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

export interface WebdavPasswordStore {
  /** Saves the password for the address; an empty password removes it. */
  set(address: string, password: string): Promise<void>
  /** The password saved for this very address, or undefined. */
  forAddress(address: string): Promise<string | undefined>
}

/**
 * Keeps the WebDAV password in a file of its own, encrypted by the system. It is not in the database,
 * so it is in no backup and never syncs. The password is kept with the address it was saved for and
 * handed out only for that address, so a changed address never receives the old password.
 */
export function createWebdavPasswordStore(file: string, encryption: SystemEncryption): WebdavPasswordStore {
  return {
    async set(address, password) {
      if (password === '') {
        await rm(file, { force: true })
        return
      }
      if (!encryption.isAvailable()) {
        throw new Error('This system has no keyring to keep the password encrypted, so it was not saved')
      }
      await writeFile(file, encryption.encrypt(JSON.stringify({ address: address.trim(), password })))
    },
    async forAddress(address) {
      let data: Buffer
      try {
        data = await readFile(file)
      } catch {
        return undefined
      }
      try {
        const saved = JSON.parse(encryption.decrypt(data)) as { address?: unknown; password?: unknown }
        return saved.address === address.trim() && typeof saved.password === 'string' ? saved.password : undefined
      } catch {
        // A file from another user or computer, or a damaged one.
        return undefined
      }
    }
  }
}
