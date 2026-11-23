import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeSyncFile, encodeSyncFile, SYNC_ROOT_FOLDER, syncFileName } from '../../packages/sync/src/format'
import { TEST_DATA_DIR } from '../paths'
import { LEVEL1_TECHS } from '../subscriptions/fixtures'

/** A second test computer, whose file the app check merges. */
export const SECOND_COMPUTER = '00000000-0000-4000-8000-00000000c0de'
export const SYNCED_ACCENT = '#d9663d'

describe('app check sync folder', () => {
  it('holds a file from a second computer with a subscription, a synced setting and a local setting', () => {
    const folder = join(TEST_DATA_DIR, 'sync', 'app-check', SYNC_ROOT_FOLDER, SECOND_COMPUTER)
    rmSync(folder, { recursive: true, force: true })
    mkdirSync(folder, { recursive: true })
    const time = Date.now()
    const name = syncFileName(time, 0)
    writeFileSync(join(folder, name), encodeSyncFile({
      format: 'fraitube-sync',
      version: 1,
      computerId: SECOND_COMPUTER,
      createdAt: time,
      changes: [
        {
          table: 'subscriptions',
          key: LEVEL1_TECHS,
          data: JSON.stringify({ id: LEVEL1_TECHS, name: 'Level1Techs', avatar: '', subscribedAt: time }),
          changedAt: time,
          removed: false
        },
        { table: 'settings', key: 'appearance.accent', data: JSON.stringify(SYNCED_ACCENT), changedAt: time, removed: false },
        // Local settings never sync, so the app must leave its own volume alone.
        { table: 'local_settings', key: 'player.volume', data: '25', changedAt: time, removed: false }
      ]
    }))
    expect(readdirSync(folder)).toEqual([name])
    expect(decodeSyncFile(readFileSync(join(folder, name))).changes).toHaveLength(3)
  })
})
