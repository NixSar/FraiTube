import { describe, expect, it } from 'vitest'
import { sqlFor, statementsOf, supportsStrict } from '../../packages/android-web/src/sqlText'
import { createRecordTableSql } from '../../packages/storage/src/records'

describe('whether a SQLite version knows STRICT tables', () => {
  it('says no below 3.37', () => {
    expect(supportsStrict('3.28.0')).toBe(false)
    expect(supportsStrict('3.32.2')).toBe(false)
    expect(supportsStrict('3.36.9')).toBe(false)
  })

  it('says yes from 3.37 on', () => {
    expect(supportsStrict('3.37.0')).toBe(true)
    expect(supportsStrict('3.39.2')).toBe(true)
    expect(supportsStrict('3.50')).toBe(true)
    expect(supportsStrict('4.0.0')).toBe(true)
  })

  it('says no for a text that is not a version', () => {
    expect(supportsStrict('')).toBe(false)
  })
})

describe('a statement as the phone takes it', () => {
  it('stays as written where SQLite knows STRICT', () => {
    const sql = createRecordTableSql('history')
    expect(sqlFor(sql, true)).toBe(sql)
  })

  it('loses the word STRICT where SQLite does not know it', () => {
    expect(sqlFor('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT', false))
      .toBe('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  })

  it('keeps everything but the word in a record table', () => {
    const plain = sqlFor(createRecordTableSql('history'), false)
    expect(plain).not.toMatch(/STRICT/)
    expect(plain).toContain('removed INTEGER NOT NULL DEFAULT 0\n  );')
    expect(plain).toContain('CREATE INDEX history_changed_at ON history (changed_at);')
  })

  it('drops the word after each of several tables', () => {
    const plain = sqlFor(createRecordTableSql('settings') + createRecordTableSql('local_settings'), false)
    expect(plain).not.toMatch(/STRICT/)
    expect(plain.match(/CREATE TABLE/g)).toHaveLength(2)
  })

  it('leaves a statement without the word alone', () => {
    const sql = 'SELECT key, data FROM history WHERE removed = 0 ORDER BY key'
    expect(sqlFor(sql, false)).toBe(sql)
  })
})

describe('the single statements of a text', () => {
  it('splits a record table into its table and its index', () => {
    const statements = statementsOf(createRecordTableSql('history'))
    expect(statements).toHaveLength(2)
    expect(statements[0]).toMatch(/^CREATE TABLE history/)
    expect(statements[1]).toBe('CREATE INDEX history_changed_at ON history (changed_at)')
  })

  it('leaves out the settings the Android side makes itself', () => {
    expect(statementsOf('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')).toEqual([])
  })

  it('returns a single statement as it is', () => {
    expect(statementsOf('BEGIN IMMEDIATE')).toEqual(['BEGIN IMMEDIATE'])
  })
})
