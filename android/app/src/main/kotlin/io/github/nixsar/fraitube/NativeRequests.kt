package io.github.nixsar.fraitube

import android.content.Context
import android.util.Base64
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject

/**
 * The browser name every YouTube request carries: a desktop Chrome of the web view's own version,
 * so YouTube answers with the pages the desktop app reads.
 */
internal fun desktopUserAgent(context: Context): String {
    val major = Regex("Chrome/(\\d+)").find(WebSettings.getDefaultUserAgent(context))?.groupValues?.get(1) ?: "138"
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$major.0.0.0 Safari/537.36"
}

/**
 * True for https addresses on YouTube, its search suggestions server or its video servers, the only
 * hosts the app page may reach.
 */
internal fun isYoutubeAddress(url: URL): Boolean =
    url.protocol == "https" && url.port == -1 && url.userInfo == null &&
        (url.host == "www.youtube.com" || url.host == "suggestqueries-clients6.youtube.com" || url.host.endsWith(".googlevideo.com"))

/** True for the address a SponsorBlock server lists a video's skip segments under, on any https server. */
internal fun isSegmentsAddress(url: URL): Boolean =
    url.protocol == "https" && url.userInfo == null && url.path.startsWith("/api/skipSegments/")

/**
 * Makes the network requests a page asks for. A page registers a request with its body and gets an
 * ID; it then fetches its own address with that ID, and the answer streams back as that fetch's body.
 * The real status and headers travel in headers of their own, since a web view answer cannot carry
 * every status.
 */
internal class NativeRequests(
    private val userAgent: String,
    private val allowed: (URL) -> Boolean,
    private val methods: Set<String> = setOf("GET", "POST"),
    private val extraHeaders: (URL) -> Map<String, String> = { emptyMap() }
) {
    private class Pending(val url: URL, val method: String, val headers: Map<String, String>, val body: ByteArray?)

    private val pending = ConcurrentHashMap<String, Pending>()

    /** Registers a request and returns its ID. Throws when the address or method is not allowed. */
    fun register(details: String, bodyBase64: String): String {
        val json = JSONObject(details)
        val url = URL(json.getString("url"))
        val method = json.getString("method")
        require(allowed(url) && method in methods) { "Request refused" }

        val headers = mutableMapOf<String, String>()
        val given = json.optJSONObject("headers")
        if (given != null) {
            for (name in given.keys()) {
                headers[name] = given.getString(name)
            }
        }
        val body = if (bodyBase64.isEmpty()) null else Base64.decode(bodyBase64, Base64.DEFAULT)

        val id = UUID.randomUUID().toString()
        pending[id] = Pending(url, method, headers, body)
        return id
    }

    /** Makes the registered request and returns its answer. Call from a background thread. */
    fun answer(id: String): WebResourceResponse {
        val request = pending.remove(id) ?: return failure("Unknown request")
        return try {
            perform(request)
        } catch (error: IOException) {
            failure(error.message ?: "The request failed")
        } catch (error: IllegalArgumentException) {
            failure(error.message ?: "The request failed")
        }
    }

    private fun perform(request: Pending): WebResourceResponse {
        var url = request.url
        var method = request.method
        var body = request.body

        repeat(MAX_REDIRECTS + 1) {
            val connection = url.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.useCaches = false

            var namesLanguage = false
            for ((name, value) in request.headers + extraHeaders(url)) {
                val lower = name.lowercase()
                if (lower !in SKIPPED_REQUEST_HEADERS) {
                    connection.setRequestProperty(name, value)
                    namesLanguage = namesLanguage || lower == "accept-language"
                }
            }
            connection.setRequestProperty("User-Agent", userAgent)
            if (!namesLanguage) {
                connection.setRequestProperty("Accept-Language", "en-US,en")
            }

            val sent = body
            if (method == "POST" && sent != null) {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(sent.size)
                connection.outputStream.use { it.write(sent) }
            }

            val status = connection.responseCode
            val location = connection.getHeaderField("Location")
            if (status in REDIRECTS && location != null) {
                connection.disconnect()
                val next = URL(url, location)
                require(allowed(next)) { "Redirect refused" }
                if (status == 303 || method == "POST" && status != 307 && status != 308) {
                    method = "GET"
                    body = null
                }
                url = next
                return@repeat
            }
            return respond(connection, status)
        }
        throw IOException("Too many redirects")
    }

    private fun respond(connection: HttpURLConnection, status: Int): WebResourceResponse {
        val headers = JSONArray()
        for ((name, values) in connection.headerFields) {
            if (name == null || name.lowercase() in SKIPPED_RESPONSE_HEADERS) {
                continue
            }
            for (value in values) {
                headers.put(JSONArray().put(name).put(value))
            }
        }

        val stream: InputStream = (if (status >= 400) connection.errorStream else connection.inputStream)
            ?: ByteArrayInputStream(ByteArray(0))
        val closing = object : FilterInputStream(stream) {
            override fun close() {
                super.close()
                connection.disconnect()
            }
        }

        return WebResourceResponse(
            "application/octet-stream",
            null,
            200,
            "OK",
            mapOf(
                "Cache-Control" to "no-store",
                "x-fraitube-status" to status.toString(),
                "x-fraitube-status-text" to encode(connection.responseMessage ?: ""),
                "x-fraitube-headers" to encode(headers.toString())
            ),
            closing
        )
    }

    private fun failure(message: String): WebResourceResponse = WebResourceResponse(
        "application/octet-stream",
        null,
        200,
        "OK",
        mapOf("Cache-Control" to "no-store", "x-fraitube-status" to "0", "x-fraitube-error" to encode(message)),
        ByteArrayInputStream(ByteArray(0))
    )

    /** Encodes a text so the page reads it back with decodeURIComponent. */
    private fun encode(text: String): String = URLEncoder.encode(text, "UTF-8").replace("+", "%20")

    private companion object {
        const val MAX_REDIRECTS = 5
        const val CONNECT_TIMEOUT_MS = 30_000
        const val READ_TIMEOUT_MS = 60_000
        val REDIRECTS = setOf(301, 302, 303, 307, 308)

        /** Headers the connection sets itself. */
        val SKIPPED_REQUEST_HEADERS = setOf("host", "content-length", "accept-encoding", "connection", "user-agent")

        /** Cookies are never kept, and the body arrives already unpacked. */
        val SKIPPED_RESPONSE_HEADERS = setOf("set-cookie", "content-encoding", "content-length", "transfer-encoding")
    }
}
