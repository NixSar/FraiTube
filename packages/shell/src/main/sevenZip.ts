import { readFile } from 'node:fs/promises'
import sevenZipWasm from '7z-wasm/7zz.wasm?asset'
import type { LoadSevenZip } from '@fraitube/backup'

/** Loads the 7-Zip program bundled with the app. */
export const loadSevenZip: LoadSevenZip = async () => {
  const data = await readFile(sevenZipWasm)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}
