package io.github.nixsar.fraitube

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.IOException

private val MIME_TYPES = mapOf(
    "html" to "text/html",
    "js" to "text/javascript",
    "css" to "text/css",
    "json" to "application/json",
    "svg" to "image/svg+xml",
    "png" to "image/png",
    "jpg" to "image/jpeg",
    "ico" to "image/x-icon",
    "woff2" to "font/woff2",
    "wasm" to "application/wasm"
)

private val TEXT_TYPES = setOf("html", "js", "css", "json", "svg")

/** Folder of the packed pages inside the app's assets. */
internal const val WEB_ASSETS = "web"

internal fun emptyResponse(status: Int, reason: String): WebResourceResponse =
    WebResourceResponse("text/plain", "utf-8", status, reason, emptyMap(), ByteArrayInputStream(ByteArray(0)))

/** One of the pages or files packed inside the app, for the given path under the packed pages folder. */
internal fun assetResponse(context: Context, path: String): WebResourceResponse {
    val file = path.trimStart('/').ifEmpty { "index.html" }
    if (file.split('/').any { it == ".." || it.isEmpty() }) {
        return emptyResponse(404, "Not Found")
    }
    val extension = file.substringAfterLast('.', "")
    return try {
        WebResourceResponse(
            MIME_TYPES[extension] ?: "application/octet-stream",
            if (extension in TEXT_TYPES) "utf-8" else null,
            context.assets.open("$WEB_ASSETS/$file")
        )
    } catch (error: IOException) {
        emptyResponse(404, "Not Found")
    }
}
