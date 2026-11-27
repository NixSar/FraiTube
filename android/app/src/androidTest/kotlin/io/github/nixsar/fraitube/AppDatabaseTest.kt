package io.github.nixsar.fraitube

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs the statements the storage code sends through the phone's own SQLite: the table definitions
 * as they are sent where SQLite does not know STRICT, and the reads and writes of a record table.
 */
@RunWith(AndroidJUnit4::class)
class AppDatabaseTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var database: AppDatabase

    @Before
    fun open() {
        context.deleteDatabase(TEST_FILE)
        database = AppDatabase(context, TEST_FILE)
    }

    @After
    fun close() {
        database.close()
        context.deleteDatabase(TEST_FILE)
        context.deleteDatabase("$TEST_FILE.before-restore")
        context.deleteDatabase("$TEST_FILE.restore")
    }

    private fun values(params: Array<out Any?>): String = JSONArray(params.map { it ?: JSONObject.NULL }).toString()

    private fun write(sql: String, vararg params: Any?): JSONObject = JSONObject(database.run(sql, values(params), false))

    private fun mustWrite(sql: String, vararg params: Any?) {
        val answer = write(sql, *params)
        assertFalse("$sql failed: ${answer.optString("error")}", answer.has("error"))
    }

    private fun rows(sql: String, vararg params: Any?): JSONArray {
        val answer = JSONObject(database.run(sql, values(params), true))
        assertFalse("$sql failed: ${answer.optString("error")}", answer.has("error"))
        return answer.getJSONArray("rows")
    }

    private fun sqliteVersion(): String = rows("SELECT sqlite_version() AS version").getJSONObject(0).getString("version")

    private fun knowsStrict(): Boolean {
        val parts = sqliteVersion().split('.').map { it.toInt() }
        return parts[0] > 3 || parts[0] == 3 && parts[1] >= 37
    }

    private fun createTablesWithoutStrict() {
        mustWrite("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        mustWrite("CREATE TABLE IF NOT EXISTS _schema (module TEXT PRIMARY KEY, version INTEGER NOT NULL)")
        mustWrite(
            """CREATE TABLE history (
    key TEXT PRIMARY KEY,
    data TEXT,
    changed_at INTEGER NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0
  )"""
        )
        mustWrite("CREATE INDEX history_changed_at ON history (changed_at)")
    }

    @Test
    fun tableDefinitionsWithoutStrictAreAccepted() {
        Log.i(LOG_TAG, "SQLite ${sqliteVersion()} on Android ${android.os.Build.VERSION.RELEASE}")
        createTablesWithoutStrict()
        mustWrite("INSERT INTO _meta (key, value) VALUES ('computer_id', ?) ON CONFLICT (key) DO NOTHING", "first")
        mustWrite("INSERT INTO _meta (key, value) VALUES ('computer_id', ?) ON CONFLICT (key) DO NOTHING", "second")
        assertEquals("first", rows("SELECT value FROM _meta WHERE key = 'computer_id'").getJSONObject(0).getString("value"))
        mustWrite("INSERT INTO _schema (module, version) VALUES (?, ?) ON CONFLICT (module) DO UPDATE SET version = excluded.version", "history", 1)
        assertEquals(1, rows("SELECT version FROM _schema WHERE module = ?", "history").getJSONObject(0).getInt("version"))
    }

    @Test
    fun aRecordIsWrittenReadAndMarkedRemoved() {
        createTablesWithoutStrict()
        val upsert = """INSERT INTO history (key, data, changed_at, removed) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET data = excluded.data, changed_at = excluded.changed_at, removed = excluded.removed"""
        mustWrite(upsert, "abc", "{\"a\":1}", 1732550000000L, 0)

        val stored = rows("SELECT key, data, changed_at, removed FROM history WHERE key = ?", "abc").getJSONObject(0)
        assertEquals("{\"a\":1}", stored.getString("data"))
        assertEquals(1732550000000L, stored.getLong("changed_at"))
        assertEquals(1, rows("SELECT key, data FROM history WHERE removed = 0 ORDER BY key").length())

        mustWrite(upsert, "abc", null, 1732550000001L, 1)
        val removed = rows("SELECT key, data, changed_at, removed FROM history WHERE changed_at > ? ORDER BY changed_at, key", 1732550000000L)
        assertEquals(1, removed.length())
        assertTrue(removed.getJSONObject(0).isNull("data"))
        assertEquals(1, removed.getJSONObject(0).getInt("removed"))
        assertEquals(0, rows("SELECT key, data FROM history WHERE removed = 0 ORDER BY key").length())
    }

    @Test
    fun aTransactionHoldsAcrossStatements() {
        createTablesWithoutStrict()
        mustWrite("BEGIN IMMEDIATE")
        mustWrite("INSERT INTO _meta (key, value) VALUES (?, ?)", "kept", "no")
        mustWrite("ROLLBACK")
        assertEquals(0, rows("SELECT value FROM _meta WHERE key = ?", "kept").length())

        mustWrite("BEGIN IMMEDIATE")
        mustWrite("INSERT INTO _meta (key, value) VALUES (?, ?)", "kept", "yes")
        mustWrite("COMMIT")
        assertEquals("yes", rows("SELECT value FROM _meta WHERE key = ?", "kept").getJSONObject(0).getString("value"))
    }

    @Test
    fun aBackupWithStrictTablesIsRestoredAsThisPhones() {
        createTablesWithoutStrict()
        mustWrite("INSERT INTO _meta (key, value) VALUES ('computer_id', ?)", "phone-id")
        mustWrite("CREATE TABLE local_settings (key TEXT PRIMARY KEY, data TEXT, changed_at INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0)")
        mustWrite("INSERT INTO local_settings (key, data, changed_at, removed) VALUES (?, ?, ?, ?)", "phone-local", "2", 5, 0)

        // A database as the desktop makes it, with STRICT tables, another computer's ID and its sync state.
        val backup = File(context.cacheDir, "strict-backup-test.db")
        InstrumentationRegistry.getInstrumentation().context.assets.open("strict-backup.db").use { input ->
            backup.outputStream().use { input.copyTo(it) }
        }
        database.restore(backup, listOf("local_settings"), listOf("sync_versions", "sync_read_files"))

        assertEquals("phone-id", rows("SELECT value FROM _meta WHERE key = 'computer_id'").getJSONObject(0).getString("value"))
        assertEquals("{\"a\":1}", rows("SELECT data FROM history WHERE key = ?", "abc").getJSONObject(0).getString("data"))
        val local = rows("SELECT key FROM local_settings ORDER BY key")
        assertEquals(1, local.length())
        assertEquals("phone-local", local.getJSONObject(0).getString("key"))
        assertEquals(0, rows("SELECT name FROM sync_read_files").length())

        // The restored tables take the storage code's writes.
        mustWrite(
            """INSERT INTO history (key, data, changed_at, removed) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET data = excluded.data, changed_at = excluded.changed_at, removed = excluded.removed""",
            "abc", "{\"a\":2}", 1732550000002L, 0
        )
        assertEquals("{\"a\":2}", rows("SELECT data FROM history WHERE key = ?", "abc").getJSONObject(0).getString("data"))
    }

    @Test
    fun strictIsRefusedOnlyWhereSqliteDoesNotKnowIt() {
        val answer = write("CREATE TABLE strict_table (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT")
        assertEquals("SQLite ${sqliteVersion()}: ${answer.optString("error")}", !knowsStrict(), answer.has("error"))
    }

    private companion object {
        const val TEST_FILE = "database-test.db"
        const val LOG_TAG = "FraiTubeTest"
    }
}
