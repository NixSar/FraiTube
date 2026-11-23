import type { DatabaseSync } from 'node:sqlite'

/** One numbered upgrade step. Steps of a module are numbered 1, 2, 3 and run in that order, once each. */
export interface Migration {
  version: number
  up: string | ((db: DatabaseSync) => void)
}

/** The tables one module owns, as the list of steps that build them. */
export interface ModuleSchema {
  module: string
  migrations: Migration[]
  /** The module's record tables that sync between computers. Tables left out stay on this computer. */
  synced?: string[]
}

const NAME = /^[a-z][a-z0-9_]*$/

/** Returns true for names that are safe to use as module, table or column names. */
export function isSafeName(value: string): boolean {
  return NAME.test(value)
}

function validate(schemas: ModuleSchema[]): void {
  const seen = new Set<string>()
  const synced = new Set<string>()
  for (const schema of schemas) {
    if (!isSafeName(schema.module)) {
      throw new Error(`Invalid module name "${schema.module}"`)
    }
    if (seen.has(schema.module)) {
      throw new Error(`Duplicate schema for module "${schema.module}"`)
    }
    seen.add(schema.module)
    schema.migrations.forEach((migration, index) => {
      if (migration.version !== index + 1) {
        throw new Error(`Module "${schema.module}" must number its steps 1, 2, 3 in order`)
      }
    })
    for (const table of schema.synced ?? []) {
      if (!isSafeName(table) || synced.has(table)) {
        throw new Error(`Module "${schema.module}" lists the synced table "${table}" more than once or with an invalid name`)
      }
      synced.add(table)
    }
  }
}

/** The synced record tables of every module, in module order. */
export function syncedTables(schemas: readonly ModuleSchema[]): string[] {
  return schemas.flatMap((schema) => schema.synced ?? [])
}

/** Brings every module's tables up to date. All pending steps run in one transaction, so a failure changes nothing. */
export function migrate(db: DatabaseSync, schemas: ModuleSchema[]): void {
  validate(schemas)
  db.exec('CREATE TABLE IF NOT EXISTS _schema (module TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT')

  const readVersion = db.prepare('SELECT version FROM _schema WHERE module = ?')
  const writeVersion = db.prepare(
    'INSERT INTO _schema (module, version) VALUES (?, ?) ON CONFLICT (module) DO UPDATE SET version = excluded.version'
  )

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const schema of schemas) {
      const row = readVersion.get(schema.module) as { version: number } | undefined
      const current = row?.version ?? 0
      if (current > schema.migrations.length) {
        throw new Error(`The database has module "${schema.module}" at version ${current}, newer than this app knows`)
      }
      for (const migration of schema.migrations.slice(current)) {
        if (typeof migration.up === 'string') {
          db.exec(migration.up)
        } else {
          migration.up(db)
        }
        writeVersion.run(schema.module, migration.version)
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
