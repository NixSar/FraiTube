package io.github.nixsar.fraitube

import android.util.Base64
import android.webkit.WebResourceResponse
import java.io.File
import java.io.FilterInputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Files on their way between the Android side and the page, kept in the app's private cache. A file
 * for the page is offered under an ID, fetched once from the page's own address and then deleted. A
 * file from the page arrives in pieces under an ID and is taken once.
 */
internal class OneTimeFiles(private val folder: File) {
    private val offered = ConcurrentHashMap<String, File>()
    private val uploads = ConcurrentHashMap<String, File>()

    /** A new, not yet existing file in the cache. */
    fun newFile(prefix: String): File = File(folder, "$prefix-${UUID.randomUUID()}")

    /** Offers a file to the page and returns the ID it is fetched with. */
    fun offer(file: File): String {
        val id = UUID.randomUUID().toString()
        offered[id] = file
        return id
    }

    /** The contents of an offered file, handed out once. */
    fun answer(id: String): WebResourceResponse {
        val file = offered.remove(id) ?: return emptyResponse(404, "Not Found")
        val stream = object : FilterInputStream(file.inputStream()) {
            override fun close() {
                super.close()
                file.delete()
            }
        }
        return WebResourceResponse("application/octet-stream", null, 200, "OK", mapOf("Cache-Control" to "no-store"), stream)
    }

    /** Starts a file the page sends in pieces, and returns its ID. */
    fun startUpload(): String {
        val id = UUID.randomUUID().toString()
        val file = newFile("upload")
        file.writeBytes(ByteArray(0))
        uploads[id] = file
        return id
    }

    /** Adds one piece, as base64, to a file the page sends. */
    fun append(id: String, base64: String) {
        val file = uploads[id] ?: throw IOException("Unknown upload")
        file.appendBytes(Base64.decode(base64, Base64.DEFAULT))
    }

    /** The file the page sent, or null for an unknown ID. The caller deletes or moves it. */
    fun takeUpload(id: String): File? = uploads.remove(id)
}
