package io.github.nixsar.fraitube

import android.app.Activity
import android.content.Intent
import android.database.SQLException
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import java.util.zip.ZipException
import java.util.zip.ZipInputStream
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lets the user pick a file to read, or a place to save one, with Android's own pickers. For a
 * picked file the page gets its name and an ID, and then fetches the contents from its own address
 * with that ID. A NewPipe backup is answered with the rows of its watch history in place of the zip
 * itself: its database is unpacked into the app's private cache, read with the statement the page
 * gives, and deleted.
 */
internal class FileChooser(
    private val activity: Activity,
    private val files: OneTimeFiles,
    private val deliver: (callId: String, ok: Boolean, value: String) -> Unit
) {
    private class Pending(val callId: String, val kind: String, val sql: String, val params: String, val upload: File?)

    private var pending: Pending? = null

    /** Opens the file picker. Call on the main thread. The answer is the name and ID as JSON, or an empty text when nothing was chosen. */
    fun choose(callId: String, kind: String, sql: String, params: String) {
        if (pending != null || kind !in LIMITS) {
            deliver(callId, false, "Another file is being chosen")
            return
        }
        pending = Pending(callId, kind, sql, params, null)
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
        activity.startActivityForResult(intent, OPEN_CODE)
    }

    /**
     * Asks where to save a file the page sent, under a suggested name. Call on the main thread. The
     * answer is the saved file's name, or an empty text when no place was chosen.
     */
    fun save(callId: String, uploadId: String, name: String, mimeType: String) {
        val upload = files.takeUpload(uploadId)
        if (pending != null || upload == null) {
            upload?.delete()
            deliver(callId, false, "Another file is being chosen")
            return
        }
        pending = Pending(callId, SAVE, "", "", upload)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mimeType).putExtra(Intent.EXTRA_TITLE, name)
        activity.startActivityForResult(intent, SAVE_CODE)
    }

    /** Takes a picker's answer. True when the result was this chooser's. */
    fun onResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != OPEN_CODE && requestCode != SAVE_CODE) {
            return false
        }
        val request = pending ?: return true
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            request.upload?.delete()
            deliver(request.callId, true, "")
            return true
        }
        Thread {
            val (ok, value) = try {
                true to (if (request.upload != null) write(uri, request.upload) else read(uri, request))
            } catch (error: IOException) {
                false to (error.message ?: "The file could not be read")
            } catch (error: RuntimeException) {
                // A storage app or a damaged file answering in a way Android does not promise.
                request.upload?.delete()
                false to "The file could not be read (${error.javaClass.simpleName})"
            }
            activity.runOnUiThread { deliver(request.callId, ok, value) }
        }.start()
        return true
    }

    private fun write(uri: Uri, upload: File): String {
        try {
            val output = activity.contentResolver.openOutputStream(uri) ?: throw IOException("The file could not be saved")
            output.use { target -> upload.inputStream().use { it.copyTo(target) } }
        } finally {
            upload.delete()
        }
        return displayName(uri)
    }

    private fun read(uri: Uri, request: Pending): String {
        val name = displayName(uri)
        val limit = LIMITS.getValue(request.kind)
        val copy = files.newFile("import")
        try {
            val input = activity.contentResolver.openInputStream(uri) ?: throw IOException("The file could not be read")
            input.use { source -> copy.outputStream().use { copyWithLimit(source, it, limit.bytes, limit.message) } }
            if (request.kind == HISTORY && name.lowercase().endsWith(".zip")) {
                val rows = readNewPipeBackup(copy, request)
                copy.writeText(rows.toString())
            }
        } catch (error: IOException) {
            copy.delete()
            throw error
        }
        return JSONObject().put("name", name).put("id", files.offer(copy)).toString()
    }

    private fun displayName(uri: Uri): String {
        activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && !cursor.isNull(0)) {
                return cursor.getString(0)
            }
        }
        return uri.lastPathSegment ?: ""
    }

    private fun copyWithLimit(source: InputStream, target: OutputStream, limit: Long, message: String) {
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val count = source.read(buffer)
            if (count < 0) {
                return
            }
            total += count
            if (total > limit) {
                throw IOException(message)
            }
            target.write(buffer, 0, count)
        }
    }

    /** The rows of the watch history in a NewPipe backup, read from a temporary copy of its database. */
    private fun readNewPipeBackup(zip: File, request: Pending): JSONArray {
        val database = File(activity.cacheDir, "newpipe-${UUID.randomUUID()}.db")
        try {
            var entries = 0
            var found = false
            try {
                ZipInputStream(zip.inputStream()).use { archive ->
                    while (!found) {
                        val entry = archive.nextEntry ?: break
                        entries++
                        if (entry.name == NEWPIPE_DATABASE) {
                            database.outputStream().use { copyWithLimit(archive, it, MAX_DATABASE_BYTES, "The NewPipe backup's database is too large") }
                            found = true
                        }
                    }
                }
            } catch (error: ZipException) {
                throw IOException("The file is not a NewPipe backup")
            }
            if (!found) {
                throw IOException(if (entries == 0) "The file is not a NewPipe backup" else "The NewPipe backup has no database")
            }

            val db = try {
                SQLiteDatabase.openDatabase(database.path, null, SQLiteDatabase.OPEN_READONLY)
            } catch (error: SQLException) {
                throw IOException("The NewPipe backup has no readable database")
            }
            try {
                val params = JSONArray(request.params)
                val rows = JSONArray()
                db.rawQuery(request.sql, Array(params.length()) { params.get(it).toString() }).use { cursor ->
                    while (cursor.moveToNext()) {
                        rows.put(readRow(cursor))
                    }
                }
                return rows
            } catch (error: SQLException) {
                throw IOException("The NewPipe backup has no watch history")
            } finally {
                db.close()
            }
        } finally {
            database.delete()
            File(database.path + "-journal").delete()
        }
    }

    private class Limit(val bytes: Long, val message: String)

    private companion object {
        const val OPEN_CODE = 4101
        const val SAVE_CODE = 4102
        const val HISTORY = "history"
        const val SAVE = "save"
        const val NEWPIPE_DATABASE = "newpipe.db"
        const val MAX_DATABASE_BYTES = 1024L * 1024 * 1024

        /** The largest file read for each kind of file, as on the desktop. */
        val LIMITS = mapOf(
            "subscriptions" to Limit(10L * 1024 * 1024, "The file is larger than 10 MB"),
            HISTORY to Limit(100L * 1024 * 1024, "The file is larger than 100 MB"),
            "backup" to Limit(2L * 1024 * 1024 * 1024, "The file is larger than 2 GB")
        )
    }
}
