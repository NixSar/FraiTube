package io.github.nixsar.fraitube

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.IOException
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Android side of sync: the private sync folder's file calls, the copying in and out, the WebDAV
 * requests against a small WebDAV server run inside the test, and the saved password.
 */
@RunWith(AndroidJUnit4::class)
class SyncTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val local = File(context.cacheDir, "sync-test-local")
    private val far = File(context.cacheDir, "sync-test-far")
    private lateinit var server: MockWebServer
    private val dav = DavFiles()

    @Before
    fun start() {
        clean()
        local.mkdirs()
        far.mkdirs()
        server = MockWebServer()
        server.dispatcher = dav
        server.start()
    }

    @After
    fun stop() {
        server.shutdown()
        clean()
    }

    private fun clean() {
        local.deleteRecursively()
        far.deleteRecursively()
        File(context.filesDir, FILES_FOLDER).deleteRecursively()
        SecretStore(context, SECRET).set("")
    }

    private fun value(json: String): Any? = JSONObject(json).opt("value")

    private fun error(json: String): String = JSONObject(json).optString("error")

    @Test
    fun fileCallsWorkInsideTheSyncFolder() {
        val files = SyncFiles(context, FILES_FOLDER)
        assertEquals("", value(files.run("mkdir", "FraiTube/$OWN", "")))
        assertEquals("", value(files.run("writeFile", "FraiTube/$OWN/a.tmp", "AAEC/w==")))
        assertEquals("", value(files.run("rename", "FraiTube/$OWN/a.tmp", "FraiTube/$OWN/a")))
        assertEquals("AAEC/w==", value(files.run("readFile", "FraiTube/$OWN/a", "")))
        assertEquals("[{\"name\":\"a\",\"folder\":false}]", value(files.run("readdir", "FraiTube/$OWN", "")).toString())
        assertEquals("[{\"name\":\"$OWN\",\"folder\":true}]", value(files.run("readdir", "FraiTube", "")).toString())
        assertEquals("", value(files.run("rm", "FraiTube/$OWN/a", "")))
        assertEquals("[]", value(files.run("readdir", "FraiTube/$OWN", "")).toString())
        assertEquals("The folder does not exist", error(files.run("readdir", "FraiTube/missing", "")))
    }

    @Test
    fun fileCallsRefuseAPathOutsideTheSyncFolder() {
        val files = SyncFiles(context, FILES_FOLDER)
        val up = ".." + "/"
        assertEquals("The path leaves the sync folder", error(files.run("writeFile", "${up}outside", "AA==")))
        assertEquals("The path leaves the sync folder", error(files.run("readdir", "FraiTube/$up$up", "")))
        assertFalse(File(context.filesDir, "outside").exists())
    }

    /** Runs the same copy checks against any remote place. */
    private fun copiesInAndOut(remote: SyncRemote, put: (path: List<String>, text: String) -> Unit, has: (path: List<String>) -> Boolean) {
        val transfer = SyncTransfer(local, remote, OWN)

        // Another computer's folder with two sync files, one stray file, and a folder that is no computer's.
        remote.makeFolder(listOf("FraiTube"))
        remote.makeFolder(listOf("FraiTube", OTHER))
        remote.makeFolder(listOf("FraiTube", "notes"))
        put(listOf("FraiTube", OTHER, FILE_1), "one")
        put(listOf("FraiTube", OTHER, FILE_2), "two")
        put(listOf("FraiTube", OTHER, "readme.txt"), "stray")

        transfer.pull()
        assertEquals("one", File(local, "$OTHER/$FILE_1").readText())
        assertEquals("two", File(local, "$OTHER/$FILE_2").readText())
        assertEquals(listOf(FILE_1, FILE_2), File(local, OTHER).list()!!.sorted())
        assertFalse(File(local, "notes").exists())

        // The other computer replaces its files by one; the local copy follows.
        remote.delete(listOf("FraiTube", OTHER, FILE_1))
        remote.delete(listOf("FraiTube", OTHER, FILE_2))
        put(listOf("FraiTube", OTHER, FILE_3), "three")
        transfer.pull()
        assertEquals(listOf(FILE_3), File(local, OTHER).list()!!.sorted())

        // The phone's own files go out, and a file it no longer has is removed there.
        File(local, OWN).mkdirs()
        File(local, "$OWN/$FILE_1").writeText("mine one")
        File(local, "$OWN/$FILE_2").writeText("mine two")
        transfer.push()
        assertTrue(has(listOf("FraiTube", OWN, FILE_1)))
        assertTrue(has(listOf("FraiTube", OWN, FILE_2)))
        assertEquals(listOf(FILE_1, FILE_2), remote.list(listOf("FraiTube", OWN)).map { it.name }.sorted())

        File(local, "$OWN/$FILE_1").delete()
        transfer.push()
        assertEquals(listOf(FILE_2), remote.list(listOf("FraiTube", OWN)).map { it.name })

        // What came out reads back unchanged.
        val back = File(context.cacheDir, "sync-test-back")
        remote.read(listOf("FraiTube", OWN, FILE_2), back)
        assertEquals("mine two", back.readText())
        back.delete()
    }

    @Test
    fun copiesThroughAFolder() {
        copiesInAndOut(
            DiskRemote(far),
            { path, text -> File(far, path.joinToString("/")).writeText(text) },
            { path -> File(far, path.joinToString("/")).isFile }
        )
    }

    @Test
    fun copiesThroughWebDav() {
        val remote = WebDavRemote(server.url("/dav/files/tester/").toString(), "tester", "pass word")
        copiesInAndOut(
            remote,
            { path, text -> dav.files["/dav/files/tester/" + path.joinToString("/")] = text.toByteArray() },
            { path -> dav.files.containsKey("/dav/files/tester/" + path.joinToString("/")) }
        )
        // Every request carried the login.
        assertTrue(dav.logins.isNotEmpty())
        assertEquals(setOf(okhttp3.Credentials.basic("tester", "pass word", Charsets.UTF_8)), dav.logins)
    }

    @Test
    fun webDavReportsARefusedLoginAndAMissingFolder() {
        dav.refuse = true
        try {
            WebDavRemote(server.url("/dav/").toString(), "tester", "wrong").list(listOf("FraiTube"))
            fail("A refused login must throw")
        } catch (error: IOException) {
            assertEquals("The WebDAV server refused the user name or password", error.message)
        }
        dav.refuse = false
        try {
            WebDavRemote(server.url("/dav/").toString(), "tester", "pass").list(listOf("nowhere"))
            fail("A missing folder must throw")
        } catch (error: IOException) {
            assertEquals("The WebDAV server has no such folder", error.message)
        }
    }

    @Test
    fun webDavAddressesAreChecked() {
        assertNotNull(WebDavRemote.parseAddress("https://example.org/remote.php/dav/files/name"))
        assertNotNull(WebDavRemote.parseAddress(" http://192.168.1.10:8080/dav/ "))
        assertNull(WebDavRemote.parseAddress("ftp://example.org/dav"))
        assertNull(WebDavRemote.parseAddress("https://name:secret@example.org/dav"))
        assertNull(WebDavRemote.parseAddress("https://example.org/dav?x=1"))
        assertNull(WebDavRemote.parseAddress("not an address"))
    }

    @Test
    fun webDavListsAreReadWithFullAddressesAndEncodedNames() {
        val xml = """<?xml version="1.0"?>
            <D:multistatus xmlns:D="DAV:">
              <D:response><D:href>https://example.org/dav/My%20Files/</D:href>
                <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
              <D:response><D:href>/dav/My%20Files/a%2Bb.json.gz</D:href>
                <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat></D:response>
              <D:response><D:href>/dav/My Files/sub/</D:href>
                <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
            </D:multistatus>"""
        val entries = WebDavRemote.parseList(xml.byteInputStream(), "/dav/My%20Files/")
        assertEquals(listOf("a+b.json.gz" to false, "sub" to true), entries.map { it.name to it.isFolder })
    }

    @Test
    fun thePasswordIsKeptEncrypted() {
        val store = SecretStore(context, SECRET)
        assertFalse(store.has())
        assertEquals("", store.get())
        store.set("pässword 123")
        assertTrue(store.has())
        assertEquals("pässword 123", SecretStore(context, SECRET).get())
        val saved = File(context.filesDir, "$SECRET.secret").readBytes()
        assertFalse(String(saved, Charsets.ISO_8859_1).contains("word 123"))
        store.set("")
        assertFalse(store.has())
    }

    /** A remote place that is a folder on the device, for checking the copy logic by itself. */
    private class DiskRemote(private val root: File) : SyncRemote {
        private fun at(path: List<String>) = File(root, path.joinToString("/"))

        override fun list(folder: List<String>): List<SyncRemote.Entry> =
            (at(folder).listFiles() ?: throw IOException("missing")).map { SyncRemote.Entry(it.name, it.isDirectory) }

        override fun makeFolder(folder: List<String>) {
            at(folder).mkdir()
        }

        override fun read(file: List<String>, target: File) {
            at(file).copyTo(target, overwrite = true)
        }

        override fun write(source: File, file: List<String>) {
            source.copyTo(at(file), overwrite = true)
        }

        override fun rename(file: List<String>, newName: String) {
            at(file).renameTo(File(at(file).parentFile, newName))
        }

        override fun delete(file: List<String>) {
            at(file).delete()
        }
    }

    /** A small WebDAV server kept in memory: folders, files, and the request kinds the app sends. */
    private class DavFiles : Dispatcher() {
        val folders = HashSet<String>(listOf("/dav", "/dav/files", "/dav/files/tester"))
        val files = HashMap<String, ByteArray>()
        val logins = HashSet<String>()
        var refuse = false

        private fun parent(path: String) = path.substringBeforeLast('/')

        @Synchronized
        override fun dispatch(request: RecordedRequest): MockResponse {
            if (refuse) {
                return MockResponse().setResponseCode(401)
            }
            request.getHeader("Authorization")?.let { logins.add(it) }
            val path = request.requestUrl!!.pathSegments.filter { it.isNotEmpty() }.joinToString("/", "/")
            return when (request.method) {
                "PROPFIND" -> {
                    if (path !in folders) {
                        return MockResponse().setResponseCode(404)
                    }
                    val body = StringBuilder("<?xml version=\"1.0\" encoding=\"utf-8\"?><d:multistatus xmlns:d=\"DAV:\">")
                    fun entry(href: String, folder: Boolean) {
                        body.append("<d:response><d:href>").append(href).append("</d:href><d:propstat><d:prop><d:resourcetype>")
                        if (folder) body.append("<d:collection/>")
                        body.append("</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>")
                    }
                    entry("$path/", true)
                    folders.filter { parent(it) == path }.forEach { entry("$it/", true) }
                    files.keys.filter { parent(it) == path }.forEach { entry(it, false) }
                    body.append("</d:multistatus>")
                    MockResponse().setResponseCode(207).setHeader("Content-Type", "application/xml; charset=utf-8").setBody(body.toString())
                }
                "MKCOL" -> when {
                    path in folders -> MockResponse().setResponseCode(405)
                    parent(path) !in folders -> MockResponse().setResponseCode(409)
                    else -> {
                        folders.add(path)
                        MockResponse().setResponseCode(201)
                    }
                }
                "PUT" -> {
                    if (parent(path) !in folders) {
                        return MockResponse().setResponseCode(409)
                    }
                    files[path] = request.body.readByteArray()
                    MockResponse().setResponseCode(201)
                }
                "GET" -> files[path]?.let { MockResponse().setResponseCode(200).setBody(Buffer().write(it)) } ?: MockResponse().setResponseCode(404)
                "DELETE" -> if (files.remove(path) != null) MockResponse().setResponseCode(204) else MockResponse().setResponseCode(404)
                "MOVE" -> {
                    val bytes = files.remove(path) ?: return MockResponse().setResponseCode(404)
                    val target = request.getHeader("Destination")!!.toHttpUrl().pathSegments.joinToString("/", "/")
                    files[target] = bytes
                    MockResponse().setResponseCode(201)
                }
                else -> MockResponse().setResponseCode(405)
            }
        }
    }

    private companion object {
        const val OWN = "11111111-1111-4111-8111-111111111111"
        const val OTHER = "22222222-2222-4222-8222-222222222222"
        const val FILE_1 = "000001700000001-0000.json.gz"
        const val FILE_2 = "000001700000002-0000.json.gz"
        const val FILE_3 = "000001700000003-0000.json.gz"
        const val FILES_FOLDER = "sync-test-files"
        const val SECRET = "test-secret"
    }
}
