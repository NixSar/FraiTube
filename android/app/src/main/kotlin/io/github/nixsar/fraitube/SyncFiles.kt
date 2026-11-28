package io.github.nixsar.fraitube

import android.content.Context
import android.util.Base64
import java.io.File
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

/**
 * The app's private sync folder, where the sync engine in the page reads and writes its files. Every
 * path the page gives is taken below this folder; a path that leaves it is refused.
 */
internal class SyncFiles(context: Context, folderName: String = "sync") {
    val root = File(context.filesDir, folderName)

    /** Runs one file call. Answers with JSON holding the value, or the error. */
    fun run(op: String, path: String, arg: String): String = try {
        JSONObject().put("value", call(op, path, arg)).toString()
    } catch (error: IOException) {
        JSONObject().put("error", error.message ?: "The sync file call failed").toString()
    } catch (error: IllegalArgumentException) {
        JSONObject().put("error", error.message ?: "The sync file call failed").toString()
    }

    private fun call(op: String, path: String, arg: String): Any {
        if (op == "clear") {
            // The whole private sync folder is emptied, for a start with a new sync place.
            if (root.exists() && !root.deleteRecursively()) {
                throw IOException("The sync folder could not be emptied")
            }
            return ""
        }
        val file = resolve(path)
        return when (op) {
            "mkdir" -> {
                if (!file.isDirectory && !file.mkdirs()) {
                    throw IOException("The folder could not be made")
                }
                ""
            }
            "readdir" -> {
                val entries = file.listFiles() ?: throw IOException("The folder does not exist")
                JSONArray().also { list ->
                    for (entry in entries.sortedBy { it.name }) {
                        list.put(JSONObject().put("name", entry.name).put("folder", entry.isDirectory))
                    }
                }
            }
            "readFile" -> {
                if (!file.isFile) {
                    throw IOException("The file does not exist")
                }
                if (file.length() > MAX_FILE_BYTES) {
                    throw IOException("The sync file is too large")
                }
                Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            }
            "writeFile" -> {
                file.writeBytes(Base64.decode(arg, Base64.DEFAULT))
                ""
            }
            "rename" -> {
                if (!file.renameTo(resolve(arg))) {
                    throw IOException("The file could not be renamed")
                }
                ""
            }
            "rm" -> {
                file.delete()
                ""
            }
            else -> throw IllegalArgumentException("Unknown sync file call")
        }
    }

    private fun resolve(path: String): File {
        val base = root.canonicalFile
        val file = File(base, path.trimStart('/')).canonicalFile
        if (file != base && !file.path.startsWith(base.path + File.separator)) {
            throw IllegalArgumentException("The path leaves the sync folder")
        }
        return file
    }

    private companion object {
        /** The largest sync file the page reads, as on the desktop. */
        const val MAX_FILE_BYTES = 64L * 1024 * 1024
    }
}
