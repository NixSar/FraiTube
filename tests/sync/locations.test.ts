import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findRclone,
  isRcloneProgram,
  isRcloneRemoteName,
  listRemotes,
  parseRemotes,
  rcloneCommands,
  rcloneFileName,
  remoteRoot,
  syncWithFolder,
  syncWithRclone
} from '../../packages/sync/src/locations'
import { cleanUp, computer, testFolder } from './helpers'

afterEach(cleanUp)

const ID = '0f0e5b8c-1a2b-4c3d-8e9f-0123456789ab'
const RCLONE = join(process.cwd(), 'bin', rcloneFileName(process.platform))

describe('rclone commands', () => {
  it('use the FraiTube folder of the remote, fetch every other folder, and send only the own folder', () => {
    expect(remoteRoot('mydrive:')).toBe('mydrive:FraiTube')
    expect(rcloneCommands('mydrive:FraiTube', 'staging', ID)).toEqual({
      prepare: ['mkdir', 'mydrive:FraiTube'],
      download: ['sync', 'mydrive:FraiTube', 'staging', '--exclude', `/${ID}/**`],
      upload: ['sync', join('staging', ID), `mydrive:FraiTube/${ID}`]
    })
  })

  it('accept only remote names as rclone lists them, and full executable paths', () => {
    expect(isRcloneRemoteName('mydrive:')).toBe(true)
    expect(isRcloneRemoteName('my drive-2:')).toBe(true)
    expect(isRcloneRemoteName('mydrive')).toBe(false)
    expect(isRcloneRemoteName('mydrive:path')).toBe(false)
    expect(isRcloneRemoteName('--config=x:')).toBe(false)
    expect(isRcloneProgram(RCLONE)).toBe(true)
    expect(isRcloneProgram('rclone')).toBe(false)
    expect(isRcloneProgram('')).toBe(false)
  })
})

describe('parseRemotes', () => {
  it('reads the names rclone listremotes prints', () => {
    expect(parseRemotes('mydrive:\r\nbackup box:\n\n  nas:  \nNOTICE: something\n')).toEqual(['mydrive:', 'backup box:', 'nas:'])
    expect(parseRemotes('')).toEqual([])
  })
})

describe('listRemotes', () => {
  it('runs rclone listremotes', async () => {
    const calls: string[][] = []
    const remotes = await listRemotes(RCLONE, async (program, args) => {
      calls.push([program, ...args])
      return 'mydrive:\nnas:\n'
    })
    expect(remotes).toEqual(['mydrive:', 'nas:'])
    expect(calls).toEqual([[RCLONE, 'listremotes']])
  })

  it('asks for the executable when none is set', async () => {
    await expect(listRemotes('', async () => '')).rejects.toThrow('rclone was not found')
  })
})

describe('findRclone', () => {
  it('returns the full path of the first rclone found on the PATH', async () => {
    const first = join(process.cwd(), 'one')
    const second = join(process.cwd(), 'two')
    const separator = process.platform === 'win32' ? ';' : ':'
    const wanted = join(second, rcloneFileName(process.platform))
    const found = await findRclone(`relative${separator}${first}${separator}"${second}"`, process.platform, async (file) => file === wanted)
    expect(found).toBe(wanted)
  })

  it('finds nothing when rclone is on no folder of the PATH', async () => {
    expect(await findRclone(undefined, process.platform, async () => true)).toBeUndefined()
    expect(await findRclone(join(process.cwd(), 'none'), process.platform, async () => false)).toBeUndefined()
  })

  it('looks for rclone.exe on Windows and rclone on Linux', () => {
    expect(rcloneFileName('win32')).toBe('rclone.exe')
    expect(rcloneFileName('linux')).toBe('rclone')
  })
})

describe('syncWithRclone', () => {
  it('downloads before merging and uploads after', async () => {
    const folder = testFolder('rclone')
    const a = computer(folder)
    a.storage.records('items').put('x', 1)
    const calls: string[] = []
    const result = await syncWithRclone(a.engine, {
      program: RCLONE,
      remoteName: 'mydrive:',
      staging: join(folder, 'staging'),
      computerId: a.storage.computerId,
      run: async (program, args) => {
        calls.push(`${args[0]} ${args[1]}`)
        return ''
      }
    })
    expect(calls).toEqual(['mkdir mydrive:FraiTube', 'sync mydrive:FraiTube', `sync ${join(folder, 'staging', a.storage.computerId)}`])
    expect(result.sent).toBe(1)
  })

  it('refuses a missing remote or executable before running anything', async () => {
    const folder = testFolder('rclone-missing')
    const a = computer(folder)
    let ran = false
    const run = async (): Promise<string> => {
      ran = true
      return ''
    }
    const options = { staging: join(folder, 'staging'), computerId: a.storage.computerId, run }
    await expect(syncWithRclone(a.engine, { ...options, program: RCLONE, remoteName: '' })).rejects.toThrow('Choose an rclone remote')
    await expect(syncWithRclone(a.engine, { ...options, program: '', remoteName: 'mydrive:' })).rejects.toThrow('rclone was not found')
    expect(ran).toBe(false)
  })
})

describe('syncWithFolder', () => {
  it('syncs two computers through the FraiTube folder inside the chosen folder', async () => {
    const folder = testFolder('folder')
    const a = computer(folder)
    const b = computer(folder)
    a.storage.records('items').put('x', 'shared')
    await syncWithFolder(a.engine, folder)
    expect(await syncWithFolder(b.engine, folder)).toMatchObject({ received: 1 })
    expect(b.storage.records('items').get('x')).toBe('shared')
  })

  it('refuses a folder that is missing or not chosen', async () => {
    const folder = testFolder('folder-missing')
    const a = computer(folder)
    await expect(syncWithFolder(a.engine, '')).rejects.toThrow('Choose a sync folder')
    await expect(syncWithFolder(a.engine, join(folder, 'missing'))).rejects.toThrow('does not exist')
  })
})
