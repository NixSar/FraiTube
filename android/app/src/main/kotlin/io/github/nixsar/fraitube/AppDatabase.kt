package io.github.nixsar.fraitube

import android.content.Context
import android.database.Cursor
import android.database.SQLException
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import org.json.JSONArray
import org.json.JSONObject

/**
 * This phone's database, kept in the app's private data folder and run by the SQLite that Android
 * provides. The page sends one statement at a time and always from the same thread, so a
 * transaction the page begins stays with the statements that follow it.
 */
internal class AppDatabase(private val context: Context, private val fileName: String = FILE_NAME) {
    private var db: SQLiteDatabase? = null

    private val file: File
        get() = context.getDatabasePath(fileName)

    private fun open(): SQLiteDatabase {
        db?.let { return it }
        file.parentFile?.mkdirs()
        val opened = SQLiteDatabase.openOrCreateDatabase(file, null).apply {
            enableWriteAheadLogging()
            setForeignKeyConstraintsEnabled(true)
        }
        db = opened
        return opened
    }

    /**
     * Runs one statement with its values, given as a JSON list. Answers with JSON: the rows of a
     * statement that reads, an empty list for one that writes, or the error.
     */
    @Synchronized
    fun run(sql: String, paramsJson: String, wantRows: Boolean): String = try {
        val params = JSONArray(paramsJson)
        val rows = JSONArray()
        if (wantRows) {
            val cursor = open().rawQueryWithFactory({ _, driver, editTable, query ->
                bind(query, params)
                SQLiteCursor(driver, editTable, query)
            }, sql, null, "")
            cursor.use {
                while (it.moveToNext()) {
                    rows.put(readRow(it))
                }
            }
        } else {
            open().execSQL(sql, Array(params.length()) { index -> bindValue(params.get(index)) })
        }
        JSONObject().put("rows", rows).toString()
    } catch (error: SQLException) {
        JSONObject().put("error", error.message ?: "The database refused the statement").toString()
    }

    @Synchronized
    fun close() {
        db?.close()
        db = null
    }

    /** Writes a consistent copy of the database into a new file, while the app keeps using the database. */
    @Synchronized
    fun copyTo(target: File) {
        try {
            open().execSQL("VACUUM INTO ?", arrayOf(target.path))
        } catch (error: SQLException) {
            target.delete()
            throw IOException("The database could not be copied")
        }
    }

    /**
     * Puts a restored database in the place of this one, which is kept next to it as the previous
     * file. The restored database is checked and made this phone's first: it keeps this phone's ID
     * and its own tables named in keepTables, and the tables named in clearTables are emptied. When
     * anything fails, this phone's database stays as it was and the reason is thrown.
     */
    @Synchronized
    fun restore(restored: File, keepTables: List<String>, clearTables: List<String>) {
        val incomingFile = File(file.path + ".restore")
        try {
            require((keepTables + clearTables).all { SAFE_NAME.matches(it) }) { "Invalid table name" }
            deleteDatabaseFiles(incomingFile)
            if (!restored.renameTo(incomingFile)) {
                restored.copyTo(incomingFile, overwrite = true)
            }
            val current = open()
            val computerId = current.rawQuery("SELECT value FROM _meta WHERE key = 'computer_id'", null).use {
                if (it.moveToFirst()) it.getString(0) else throw IOException("This phone's database has no ID")
            }
            try {
                dropStrictWhereUnknown(incomingFile)
                adopt(incomingFile, current, computerId, keepTables, clearTables)
            } catch (error: SQLException) {
                throw IOException(DAMAGED, error)
            }
        } catch (error: IOException) {
            deleteDatabaseFiles(incomingFile)
            throw error
        } finally {
            restored.delete()
        }

        // The current database is closed from here on and opens again with the next statement.
        close()
        val previous = File(file.path + ".before-restore")
        deleteDatabaseFiles(previous)
        if (!file.renameTo(previous)) {
            deleteDatabaseFiles(incomingFile)
            throw IOException(NOT_RESTORED)
        }
        File(file.path + "-wal").delete()
        File(file.path + "-shm").delete()
        if (!incomingFile.renameTo(file)) {
            previous.renameTo(file)
            deleteDatabaseFiles(incomingFile)
            throw IOException(NOT_RESTORED)
        }
    }

    /**
     * A database made where SQLite knows STRICT tables cannot even be opened by an older SQLite. There
     * the word is blanked out in the file itself, with spaces of the same length, and only in the
     * pages that hold the table definitions. The tables then hold the same data without the database
     * checking each value's type.
     */
    private fun dropStrictWhereUnknown(target: File) {
        if (knowsStrict()) {
            return
        }
        RandomAccessFile(target, "rw").use { database ->
            val header = ByteArray(FILE_HEADER_BYTES)
            if (database.length() < FILE_HEADER_BYTES) {
                throw IOException(DAMAGED)
            }
            database.readFully(header)
            if (String(header, 0, FILE_MAGIC.length, Charsets.US_ASCII) != FILE_MAGIC) {
                throw IOException(DAMAGED)
            }
            val stored = unsigned16(header, 16)
            val pageSize = if (stored == 1) 65536 else stored
            if (pageSize < 512) {
                throw IOException(DAMAGED)
            }
            val pageCount = database.length() / pageSize

            // The table definitions are a tree of pages that starts at page 1.
            val waiting = ArrayDeque<Long>()
            val seen = HashSet<Long>()
            val page = ByteArray(pageSize)
            waiting.add(1L)
            while (waiting.isNotEmpty()) {
                val number = waiting.removeFirst()
                if (number < 1 || number > pageCount || !seen.add(number)) {
                    continue
                }
                database.seek((number - 1) * pageSize)
                database.readFully(page)
                val start = if (number == 1L) FILE_HEADER_BYTES else 0
                when (page[start].toInt()) {
                    INNER_TABLE_PAGE -> {
                        waiting.add(unsigned32(page, start + 8))
                        for (cell in 0 until unsigned16(page, start + 3)) {
                            val pointer = unsigned16(page, start + 12 + 2 * cell)
                            if (pointer + 4 <= pageSize) {
                                waiting.add(unsigned32(page, pointer))
                            }
                        }
                    }
                    LEAF_TABLE_PAGE -> if (blankStrict(page, start)) {
                        database.seek((number - 1) * pageSize)
                        database.write(page)
                    }
                }
            }
        }
    }

    /**
     * Blanks every STRICT that follows a closing bracket and blank space, which in a table definition is
     * only the word after the column list. A definition is the last part of its record, so what follows
     * the word may already be the next record. True when the page changed.
     */
    private fun blankStrict(page: ByteArray, from: Int): Boolean {
        var changed = false
        var index = from
        while (index + STRICT.size <= page.size) {
            if (matchesStrict(page, index) && followsBracket(page, index, from)) {
                page.fill(' '.code.toByte(), index, index + STRICT.size)
                changed = true
                index += STRICT.size
            } else {
                index++
            }
        }
        return changed
    }

    private fun matchesStrict(page: ByteArray, at: Int): Boolean =
        STRICT.indices.all { (page[at + it].toInt() and 0xDF) == STRICT[it].toInt() }

    private fun followsBracket(page: ByteArray, at: Int, from: Int): Boolean {
        var index = at - 1
        while (index >= from && page[index].toInt().toChar().isWhitespace()) {
            index--
        }
        return index >= from && index < at - 1 && page[index] == ')'.code.toByte()
    }

    private fun unsigned16(bytes: ByteArray, at: Int): Int = ((bytes[at].toInt() and 0xFF) shl 8) or (bytes[at + 1].toInt() and 0xFF)

    private fun unsigned32(bytes: ByteArray, at: Int): Long =
        ((bytes[at].toLong() and 0xFF) shl 24) or ((bytes[at + 1].toLong() and 0xFF) shl 16) or
            ((bytes[at + 2].toLong() and 0xFF) shl 8) or (bytes[at + 3].toLong() and 0xFF)

    private fun knowsStrict(): Boolean {
        val memory = SQLiteDatabase.create(null)
        try {
            val version = memory.rawQuery("SELECT sqlite_version()", null).use { if (it.moveToFirst()) it.getString(0) else "" }
            val parts = version.split('.').map { it.toIntOrNull() ?: 0 }
            val major = parts.getOrElse(0) { 0 }
            val minor = parts.getOrElse(1) { 0 }
            return major > 3 || major == 3 && minor >= 37
        } finally {
            memory.close()
        }
    }

    private fun adopt(target: File, current: SQLiteDatabase, computerId: String, keepTables: List<String>, clearTables: List<String>) {
        val incoming = SQLiteDatabase.openDatabase(target.path, null, SQLiteDatabase.OPEN_READWRITE)
        try {
            val check = incoming.rawQuery("PRAGMA integrity_check", null).use { if (it.moveToFirst()) it.getString(0) else "" }
            if (check != "ok" || !hasTable(incoming, "_schema") || !hasTable(incoming, "_meta")) {
                throw IOException(DAMAGED)
            }
            incoming.beginTransaction()
            try {
                incoming.execSQL("INSERT OR REPLACE INTO _meta (key, value) VALUES ('computer_id', ?)", arrayOf(computerId))
                for (table in keepTables) {
                    if (!hasTable(incoming, table) || !hasTable(current, table)) {
                        continue
                    }
                    incoming.execSQL("DELETE FROM $table")
                    current.rawQuery("SELECT key, data, changed_at, removed FROM $table", null).use {
                        while (it.moveToNext()) {
                            incoming.execSQL(
                                "INSERT INTO $table (key, data, changed_at, removed) VALUES (?, ?, ?, ?)",
                                arrayOf(it.getString(0), if (it.isNull(1)) null else it.getString(1), it.getLong(2), it.getLong(3))
                            )
                        }
                    }
                }
                for (table in clearTables) {
                    if (hasTable(incoming, table)) {
                        incoming.execSQL("DELETE FROM $table")
                    }
                }
                incoming.setTransactionSuccessful()
            } finally {
                incoming.endTransaction()
            }
        } finally {
            incoming.close()
        }
    }

    private fun hasTable(database: SQLiteDatabase, table: String): Boolean =
        database.rawQuery("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", arrayOf(table)).use { it.moveToFirst() }

    /** Removes a database file and the files SQLite keeps next to it. */
    private fun deleteDatabaseFiles(target: File) {
        for (suffix in listOf("", "-wal", "-shm", "-journal")) {
            File(target.path + suffix).delete()
        }
    }

    /** A value as the database takes it: a whole number, a number, a text or nothing. */
    private fun bindValue(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is Int -> value.toLong()
        is Long -> value
        is Number -> value.toDouble()
        is Boolean -> if (value) 1L else 0L
        else -> value.toString()
    }

    private fun bind(program: SQLiteProgram, params: JSONArray) {
        for (index in 0 until params.length()) {
            when (val value = bindValue(params.get(index))) {
                null -> program.bindNull(index + 1)
                is Long -> program.bindLong(index + 1, value)
                is Double -> program.bindDouble(index + 1, value)
                else -> program.bindString(index + 1, value.toString())
            }
        }
    }

    private companion object {
        const val FILE_NAME = "fraitube.db"
        const val DAMAGED = "The database in this backup is damaged"
        const val NOT_RESTORED = "The backup could not be restored"
        val SAFE_NAME = Regex("^[a-z][a-z0-9_]*$")

        /** How a SQLite file starts, the length of its header, and the marks of the two kinds of pages in a table's tree. */
        const val FILE_MAGIC = "SQLite format 3\u0000"
        const val FILE_HEADER_BYTES = 100
        const val INNER_TABLE_PAGE = 0x05
        const val LEAF_TABLE_PAGE = 0x0D
        val STRICT = "STRICT".toByteArray(Charsets.US_ASCII)
    }
}

/** The row a cursor stands on, as JSON: whole numbers, numbers and texts by column name, anything else as nothing. */
internal fun readRow(cursor: Cursor): JSONObject {
    val row = JSONObject()
    for (index in 0 until cursor.columnCount) {
        val value: Any = when (cursor.getType(index)) {
            Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index)
            Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(index)
            Cursor.FIELD_TYPE_STRING -> cursor.getString(index)
            else -> JSONObject.NULL
        }
        row.put(cursor.getColumnName(index), value)
    }
    return row
}
