import SevenZip from '7z-wasm'
import type { LoadSevenZip } from './types'

/** One file inside an archive. */
export interface ArchiveFile {
  name: string
  data: Uint8Array
}

/** The archive formats read and written: 7z for backups, zip for files from other apps. */
export type ArchiveType = '7z' | 'zip'

const WORK = '/work'
const OUT = 'out'

/** The archive's file name; 7-Zip adds the type's extension to a name without one. */
function archiveName(type: ArchiveType): string {
  return `archive.${type}`
}

async function startSevenZip(loadWasm: LoadSevenZip): Promise<{ module: Awaited<ReturnType<typeof SevenZip>>; output: string[] }> {
  const output: string[] = []
  const module = await SevenZip({
    wasmBinary: await loadWasm(),
    print: (line) => output.push(line),
    printErr: (line) => output.push(line)
  })
  module.FS.mkdir(WORK)
  module.FS.chdir(WORK)
  return { module, output }
}

function run(module: Awaited<ReturnType<typeof SevenZip>>, output: string[], args: string[]): void {
  try {
    module.callMain(args)
  } catch (error) {
    // The program reports a failed run by exiting, which shows up here.
    const detail = output.filter((line) => /error/i.test(line)).pop()
    throw new Error(detail ?? (error instanceof Error ? error.message : String(error)), { cause: error })
  }
  if (output.some((line) => /^ERROR/i.test(line.trim()))) {
    throw new Error(output.filter((line) => /^ERROR/i.test(line.trim())).join(' '))
  }
}

/** Packs the files into an archive, in memory. */
export async function packArchive(files: readonly ArchiveFile[], loadWasm: LoadSevenZip, type: ArchiveType = '7z'): Promise<Uint8Array> {
  const { module, output } = await startSevenZip(loadWasm)
  for (const file of files) {
    module.FS.writeFile(file.name, file.data)
  }
  run(module, output, ['a', `-t${type}`, '-mx=9', '-bd', archiveName(type), ...files.map((file) => file.name)])
  return module.FS.readFile(archiveName(type))
}

/** Unpacks the named files of an archive, in memory. Files that are not in the archive are left out. */
export async function unpackArchive(
  archive: Uint8Array,
  names: readonly string[],
  loadWasm: LoadSevenZip,
  type: ArchiveType = '7z'
): Promise<ArchiveFile[]> {
  const { module, output } = await startSevenZip(loadWasm)
  module.FS.writeFile(archiveName(type), archive)
  // Made first, so an archive without any of the names leaves it empty.
  module.FS.mkdir(OUT)
  run(module, output, ['x', `-t${type}`, '-bd', '-y', `-o${OUT}`, archiveName(type), ...names])
  const found = new Set(module.FS.readdir(OUT))
  return names.filter((name) => found.has(name)).map((name) => ({ name, data: module.FS.readFile(`${OUT}/${name}`) }))
}
