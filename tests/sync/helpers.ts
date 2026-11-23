import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createRecordTableSql, openStorage, type ModuleSchema, type Storage } from '../../packages/storage/src/index'
import { createSyncEngine, syncSchema, type SyncEngine } from '../../packages/sync/src/index'
import { TEST_DATA_DIR } from '../paths'

/** A module with one synced table and one table that stays on its computer. */
export const itemsSchema: ModuleSchema = {
  module: 'items',
  migrations: [{ version: 1, up: createRecordTableSql('items') + createRecordTableSql('local_items') }],
  synced: ['items']
}

export interface TestComputer {
  storage: Storage
  engine: SyncEngine
  /** Set the clock used for change times and file names. */
  setTime(time: number): void
}

const opened: Storage[] = []
const folders: string[] = []

/** A new empty folder under the test data folder. */
export function testFolder(name: string): string {
  const folder = join(TEST_DATA_DIR, 'sync', `${name}-${randomUUID()}`)
  mkdirSync(folder, { recursive: true })
  folders.push(folder)
  return folder
}

/** A computer with its own database in the given folder. */
export function computer(folder: string, start = 1000): TestComputer {
  let time = start
  const now = (): number => time
  const storage = openStorage(join(folder, `${randomUUID()}.db`), [itemsSchema, syncSchema], { now })
  opened.push(storage)
  return {
    storage,
    engine: createSyncEngine({ storage, tables: ['items'], now }),
    setTime(next) {
      time = next
    }
  }
}

export function cleanUp(): void {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
}
