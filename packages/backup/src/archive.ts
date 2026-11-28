import { unzipSync, zipSync } from 'fflate'

/** One file inside an archive. */
export interface ArchiveFile {
  name: string
  data: Uint8Array
}

/** The first bytes of every 7z file. */
const SEVEN_ZIP_START = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]

/** True for the contents of a 7z file, the format of backups made up to version 0.9.10. */
export function isSevenZip(archive: Uint8Array): boolean {
  return SEVEN_ZIP_START.every((byte, index) => archive[index] === byte)
}

/** Packs the files into a zip archive, in memory. */
export function packArchive(files: readonly ArchiveFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((file) => [file.name, file.data])), { level: 9 })
}

/** Unpacks the named files of a zip archive, in memory. Files that are not in the archive are left out. */
export function unpackArchive(archive: Uint8Array, names: readonly string[]): ArchiveFile[] {
  const wanted = new Set(names)
  const found = unzipSync(archive, { filter: (file) => wanted.has(file.name) })
  return names.filter((name) => found[name] !== undefined).map((name) => ({ name, data: found[name] as Uint8Array }))
}
