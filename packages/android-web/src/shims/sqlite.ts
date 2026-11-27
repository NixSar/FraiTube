import { sqlFor, statementsOf, supportsStrict } from '../sqlText'

// Stands in for Node's sqlite module, with the calls the storage package uses. Every statement
// runs in the database the Android side keeps, and the answer comes back at once.

type Row = Record<string, unknown>

function call(sql: string, params: unknown[], wantRows: boolean): Row[] {
  const answer = JSON.parse(window.FraiTubeNative.db(sql, JSON.stringify(params), wantRows)) as { rows?: Row[]; error?: string }
  if (answer.error !== undefined) {
    throw new Error(answer.error)
  }
  return answer.rows ?? []
}

let strict: boolean | undefined

function forThisPhone(sql: string): string {
  strict ??= supportsStrict(String(call('SELECT sqlite_version() AS version', [], true)[0]?.['version'] ?? ''))
  return sqlFor(sql, strict)
}

export class StatementSync {
  private readonly sql: string

  constructor(sql: string) {
    this.sql = sql
  }

  run(...params: unknown[]): void {
    call(this.sql, params, false)
  }

  get(...params: unknown[]): Row | undefined {
    return call(this.sql, params, true)[0]
  }

  all(...params: unknown[]): Row[] {
    return call(this.sql, params, true)
  }
}

export class DatabaseSync {
  exec(sql: string): void {
    for (const statement of statementsOf(forThisPhone(sql))) {
      call(statement, [], false)
    }
  }

  prepare(sql: string): StatementSync {
    return new StatementSync(forThisPhone(sql))
  }

  /** The Android side closes the database when the app closes. */
  close(): void {
    return undefined
  }
}
