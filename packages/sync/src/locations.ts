import { execFile } from 'node:child_process'
import { access, constants, mkdir, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import type { SyncEngine } from './engine'
import { SYNC_ROOT_FOLDER } from './format'
import type { SyncResult } from './types'

/** Longest rclone executable path accepted. */
export const MAX_RCLONE_PATH_LENGTH = 1000
/** Longest time one rclone command may run. */
export const RCLONE_TIMEOUT_MS = 5 * 60_000

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
/** A configured remote as `rclone listremotes` prints it, for example "mydrive:". */
const REMOTE_NAME = /^[\w.+@][\w.+@ -]*:$/

/** A remote name with its colon, for example "mydrive:". */
export function isRcloneRemoteName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && REMOTE_NAME.test(value)
}

/** The full path of an rclone executable. */
export function isRcloneProgram(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= MAX_RCLONE_PATH_LENGTH &&
    isAbsolute(value) &&
    !CONTROL.test(value)
}

/** The remote names in the output of `rclone listremotes`. */
export function parseRemotes(output: string): string[] {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(isRcloneRemoteName)
}

/** The rclone file name on the given platform. */
export function rcloneFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'rclone.exe' : 'rclone'
}

/** Looks for rclone in every folder of the PATH, and returns its full path when found. */
export async function findRclone(
  pathVariable: string | undefined,
  platform: NodeJS.Platform,
  isExecutable: (file: string) => Promise<boolean> = defaultIsExecutable
): Promise<string | undefined> {
  const separator = platform === 'win32' ? ';' : delimiter
  for (const folder of (pathVariable ?? '').split(separator)) {
    const trimmed = folder.trim().replace(/^"(.*)"$/, '$1')
    if (!trimmed || !isAbsolute(trimmed)) {
      continue
    }
    const file = join(trimmed, rcloneFileName(platform))
    if (await isExecutable(file)) {
      return file
    }
  }
  return undefined
}

async function defaultIsExecutable(file: string): Promise<boolean> {
  try {
    const info = await stat(file)
    if (!info.isFile()) {
      return false
    }
    await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The folder that holds the computer folders inside a remote. */
export function remoteRoot(remoteName: string): string {
  return `${remoteName}${SYNC_ROOT_FOLDER}`
}

/** The rclone commands of one sync: create the remote folder, fetch the others' folders, send the own folder. */
export function rcloneCommands(root: string, staging: string, computerId: string): { prepare: string[]; download: string[]; upload: string[] } {
  return {
    prepare: ['mkdir', root],
    // The own folder is left out, so only this computer ever changes it.
    download: ['sync', root, staging, '--exclude', `/${computerId}/**`],
    upload: ['sync', join(staging, computerId), `${root}/${computerId}`]
  }
}

/** Runs a program and returns what it printed. */
export type RunCommand = (program: string, args: readonly string[]) => Promise<string>

/** Runs a program directly, without a shell, with a time limit. */
export const runCommand: RunCommand = (program, args) => new Promise((resolve, reject) => {
  execFile(program, [...args], { timeout: RCLONE_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      const detail = String(stderr).trim().split(/\r?\n/).pop()
      reject(new Error(detail ? `rclone failed: ${detail}` : `rclone failed: ${error.message}`))
    } else {
      resolve(String(stdout))
    }
  })
})

/** The remotes configured in rclone. */
export async function listRemotes(program: string, run: RunCommand = runCommand): Promise<string[]> {
  if (!isRcloneProgram(program)) {
    throw new Error('rclone was not found. Choose the rclone executable.')
  }
  return parseRemotes(await run(program, ['listremotes']))
}

/** Syncs through a folder, which holds a FraiTube folder with one folder per computer. */
export async function syncWithFolder(engine: SyncEngine, folder: string): Promise<SyncResult> {
  if (!isAbsolute(folder)) {
    throw new Error('Choose a sync folder')
  }
  const info = await stat(folder).catch(() => undefined)
  if (!info?.isDirectory()) {
    throw new Error('The sync folder does not exist')
  }
  const root = join(folder, SYNC_ROOT_FOLDER)
  await mkdir(root, { recursive: true })
  return engine.run(root)
}

export interface RcloneSyncOptions {
  /** Full path of the rclone executable. */
  program: string
  /** A configured remote, for example "mydrive:". */
  remoteName: string
  /** A local folder that mirrors the remote's FraiTube folder. */
  staging: string
  computerId: string
  run?: RunCommand
}

/** Syncs through the FraiTube folder of an rclone remote, mirrored in a local staging folder. */
export async function syncWithRclone(engine: SyncEngine, options: RcloneSyncOptions): Promise<SyncResult> {
  if (!isRcloneProgram(options.program)) {
    throw new Error('rclone was not found. Choose the rclone executable.')
  }
  if (!isRcloneRemoteName(options.remoteName)) {
    throw new Error('Choose an rclone remote')
  }
  const run = options.run ?? runCommand
  const commands = rcloneCommands(remoteRoot(options.remoteName), options.staging, options.computerId)
  await mkdir(join(options.staging, options.computerId), { recursive: true })
  await run(options.program, commands.prepare)
  await run(options.program, commands.download)
  const result = await engine.run(options.staging)
  await run(options.program, commands.upload)
  return result
}
