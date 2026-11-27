package io.github.nixsar.fraitube

import android.content.Context
import java.io.File
import java.io.IOException

/**
 * The fetched New videos feed, kept between starts as one file in the app's private folder. Each
 * save replaces the file whole, and a save that fails leaves the last one.
 */
internal class FeedFile(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)
    private val temporary = File(context.filesDir, "$FILE_NAME.tmp")

    /** The saved text, or an empty text when there is none or it cannot be read. */
    @Synchronized
    fun read(): String = try {
        if (file.isFile) file.readText() else ""
    } catch (error: IOException) {
        ""
    }

    @Synchronized
    fun write(text: String) {
        try {
            temporary.writeText(text)
            if (!temporary.renameTo(file)) {
                temporary.delete()
            }
        } catch (error: IOException) {
            temporary.delete()
        }
    }

    private companion object {
        const val FILE_NAME = "feed-cache.json"
    }
}
