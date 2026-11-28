import { toBase64 } from '../native'

/**
 * Stand-in for the part of Node's fs/promises module the sync engine uses. Every path lies in the
 * app's private sync folder, which the Android side holds.
 */

interface Entry {
  name: string
  folder: boolean
}

function call(op: string, path: string, arg = ''): unknown {
  const answer = JSON.parse(window.FraiTubeNative.syncFile(op, path, arg)) as { value?: unknown; error?: string }
  if (answer.error !== undefined) {
    throw new Error(answer.error)
  }
  return answer.value
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Makes a folder and the folders above it. */
export async function mkdir(path: string): Promise<void> {
  call('mkdir', path)
}

export function readdir(path: string): Promise<string[]>
export function readdir(path: string, options: { withFileTypes: true }): Promise<{ name: string; isDirectory(): boolean }[]>
export async function readdir(path: string, options?: { withFileTypes: true }): Promise<string[] | { name: string; isDirectory(): boolean }[]> {
  const entries = call('readdir', path) as Entry[]
  return options?.withFileTypes
    ? entries.map((entry) => ({ name: entry.name, isDirectory: () => entry.folder }))
    : entries.map((entry) => entry.name)
}

export async function readFile(path: string): Promise<Uint8Array> {
  return fromBase64(call('readFile', path) as string)
}

export async function writeFile(path: string, data: Uint8Array): Promise<void> {
  call('writeFile', path, toBase64(data))
}

export async function rename(from: string, to: string): Promise<void> {
  call('rename', from, to)
}

/** Deletes a file; one that is gone already is no error. */
export async function rm(path: string): Promise<void> {
  call('rm', path)
}
