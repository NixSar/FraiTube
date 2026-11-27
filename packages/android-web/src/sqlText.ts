/** The first SQLite version that knows STRICT tables. */
const STRICT_SINCE = [3, 37]

/** Whether a SQLite version, for example "3.32.2", knows STRICT tables. */
export function supportsStrict(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > STRICT_SINCE[0]! || (major === STRICT_SINCE[0] && minor >= STRICT_SINCE[1]!)
}

/**
 * A statement as this phone's SQLite takes it: an older SQLite does not know the word STRICT after
 * a table definition, so there the word is left out. The table then holds the same data without
 * the database checking each value's type.
 */
export function sqlFor(sql: string, strict: boolean): string {
  return strict ? sql : sql.replace(/\)\s*STRICT\b/gi, ')')
}

/**
 * The single statements of a text holding several. The Android side opens the database with its
 * settings in place, so PRAGMA statements are left out. Table definitions hold no semicolon of
 * their own, so every semicolon ends a statement.
 */
export function statementsOf(sql: string): string[] {
  return sql.split(';').map((statement) => statement.trim()).filter((statement) => statement !== '' && !/^PRAGMA\b/i.test(statement))
}
