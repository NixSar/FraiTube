package io.github.nixsar.fraitube

import android.util.Xml
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.URLDecoder
import java.util.concurrent.TimeUnit
import okhttp3.Credentials
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserException

/**
 * A folder on a WebDAV server, such as a Nextcloud account or a home storage box. Every request
 * carries the user name and password, and goes only to the address the user gave.
 */
internal class WebDavRemote(address: String, user: String, password: String) : SyncRemote {
    private val base: HttpUrl = parseAddress(address) ?: throw IOException("The WebDAV address is not a web address")
    private val login: String? = if (user.isEmpty()) null else Credentials.basic(user, password, Charsets.UTF_8)
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        // A redirect could carry the password to another address, so none is followed.
        .followRedirects(false)
        .followSslRedirects(false)
        .build()

    private fun url(path: List<String>, folder: Boolean): HttpUrl {
        val builder = base.newBuilder()
        // A base address that ends in a slash has an empty last part, which is dropped first.
        if (base.pathSegments.last().isEmpty()) {
            builder.removePathSegment(base.pathSize - 1)
        }
        path.forEach { builder.addPathSegment(it) }
        if (folder) {
            builder.addPathSegment("")
        }
        return builder.build()
    }

    private fun send(method: String, target: HttpUrl, body: RequestBody? = null, headers: Map<String, String> = emptyMap()): Response {
        val request = Request.Builder().url(target).method(method, body)
        login?.let { request.header("Authorization", it) }
        headers.forEach { (name, value) -> request.header(name, value) }
        return client.newCall(request.build()).execute()
    }

    private fun failure(response: Response): IOException = IOException(
        when (response.code) {
            401, 403 -> "The WebDAV server refused the user name or password"
            404, 409 -> "The WebDAV server has no such folder"
            507 -> "The WebDAV server is full"
            else -> "The WebDAV server answered ${response.code}"
        }
    )

    override fun list(folder: List<String>): List<SyncRemote.Entry> {
        val target = url(folder, true)
        send("PROPFIND", target, LIST_BODY.toRequestBody(XML), mapOf("Depth" to "1")).use { response ->
            if (response.code != 207) {
                throw failure(response)
            }
            val body = response.body ?: throw IOException("The WebDAV server sent no list")
            return try {
                parseList(body.byteStream(), target.encodedPath)
            } catch (error: XmlPullParserException) {
                throw IOException("The WebDAV server's list could not be read")
            }
        }
    }

    override fun makeFolder(folder: List<String>) {
        send("MKCOL", url(folder, true)).use { response ->
            // 405 is the answer for a folder that is there already.
            if (!response.isSuccessful && response.code != 405) {
                throw failure(response)
            }
        }
    }

    override fun read(file: List<String>, target: File) {
        send("GET", url(file, false)).use { response ->
            if (response.code != 200) {
                throw failure(response)
            }
            val body = response.body ?: throw IOException("The WebDAV server sent no file")
            body.byteStream().use { source -> target.outputStream().use { source.copyTo(it) } }
        }
    }

    override fun write(source: File, file: List<String>) {
        send("PUT", url(file, false), source.asRequestBody(BINARY)).use { response ->
            if (!response.isSuccessful) {
                throw failure(response)
            }
        }
    }

    override fun rename(file: List<String>, newName: String) {
        val destination = url(file.dropLast(1) + newName, false)
        send("MOVE", url(file, false), null, mapOf("Destination" to destination.toString(), "Overwrite" to "T")).use { response ->
            if (!response.isSuccessful) {
                throw failure(response)
            }
        }
    }

    override fun delete(file: List<String>) {
        send("DELETE", url(file, false)).use { response ->
            if (!response.isSuccessful && response.code != 404) {
                throw failure(response)
            }
        }
    }

    companion object {
        private val XML = "application/xml; charset=utf-8".toMediaType()
        private val BINARY = "application/octet-stream".toMediaType()
        private const val DAV = "DAV:"
        private const val LIST_BODY =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/></d:prop></d:propfind>"

        /** A WebDAV address: http or https, with no user name, password, query or fragment in it. */
        fun parseAddress(address: String): HttpUrl? {
            val url = address.trim().toHttpUrlOrNull() ?: return null
            return if (url.username.isEmpty() && url.password.isEmpty() && url.query == null && url.fragment == null) url else null
        }

        /**
         * The entries of a folder in a server's answer to a list request. The folder itself, which
         * servers list first, is left out.
         */
        fun parseList(xml: InputStream, folderPath: String): List<SyncRemote.Entry> {
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
            parser.setInput(xml, null)
            val own = decodedPath(folderPath)
            val entries = ArrayList<SyncRemote.Entry>()
            var href: String? = null
            var isFolder = false
            var inType = false
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                val dav = parser.namespace == DAV
                when (parser.eventType) {
                    XmlPullParser.START_TAG -> when {
                        dav && parser.name == "response" -> {
                            href = null
                            isFolder = false
                        }
                        dav && parser.name == "href" && href == null -> href = parser.nextText().trim()
                        dav && parser.name == "resourcetype" -> inType = true
                        dav && parser.name == "collection" && inType -> isFolder = true
                    }
                    XmlPullParser.END_TAG -> when {
                        dav && parser.name == "resourcetype" -> inType = false
                        dav && parser.name == "response" -> {
                            val path = href?.let { decodedPath(pathOf(it)) }
                            if (path != null && path != own) {
                                entries.add(SyncRemote.Entry(path.substringAfterLast('/'), isFolder))
                            }
                        }
                    }
                }
            }
            return entries
        }

        /** The path of a listed address, which servers give with or without the server's own address in front. */
        private fun pathOf(href: String): String = href.toHttpUrlOrNull()?.encodedPath ?: href.substringBefore('?')

        /** A path as plain text without the slash folders end in, so two spellings of one path compare equal. */
        private fun decodedPath(path: String): String =
            path.trimEnd('/').split('/').joinToString("/") { URLDecoder.decode(it.replace("+", "%2B"), "UTF-8") }
    }
}
