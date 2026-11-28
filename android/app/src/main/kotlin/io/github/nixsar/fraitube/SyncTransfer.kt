package io.github.nixsar.fraitube

import java.io.File
import java.io.IOException
import java.util.zip.GZIPInputStream

/**
 * The place the phone syncs through: a picked folder or a WebDAV server. Paths are lists of names
 * below that place.
 */
internal interface SyncRemote {
    class Entry(val name: String, val isFolder: Boolean)

    /** What a folder holds. Throws when the folder does not exist. */
    fun list(folder: List<String>): List<Entry>

    /** Makes a folder whose parent exists. Does nothing when it is there already. */
    fun makeFolder(folder: List<String>)

    fun read(file: List<String>, target: File)

    /** Writes a file, replacing one of the same name. */
    fun write(source: File, file: List<String>)

    /** Gives a file a new name in the same folder. */
    fun rename(file: List<String>, newName: String)

    /** Deletes a file. Does nothing when it is gone already. */
    fun delete(file: List<String>)
}

/**
 * Copies sync files between the app's private sync folder and the remote place, as rclone does on the
 * desktop: before the engine runs, the other computers' files come in; afterwards the phone's own
 * files go out. Only this phone ever changes its own folder in the remote place.
 */
internal class SyncTransfer(private val localRoot: File, private val remote: SyncRemote, private val ownId: String) {
    init {
        require(COMPUTER_ID.matches(ownId)) { "Invalid computer ID" }
    }

    /** Brings the local copies of the other computers' folders in step with the remote place. */
    fun pull() {
        remote.makeFolder(listOf(ROOT))
        for (entry in remote.list(listOf(ROOT))) {
            if (!entry.isFolder || !COMPUTER_ID.matches(entry.name) || entry.name == ownId) {
                continue
            }
            val folder = File(localRoot, entry.name)
            if (!folder.isDirectory && !folder.mkdirs()) {
                throw IOException("The sync folder could not be written")
            }
            val names = remote.list(listOf(ROOT, entry.name)).filter { !it.isFolder && SYNC_FILE.matches(it.name) }.map { it.name }.toSet()
            for (name in names) {
                val target = File(folder, name)
                if (!target.exists()) {
                    // Fetched under another name first, so the engine never reads half a file.
                    val part = File(folder, "$name.part")
                    try {
                        remote.read(listOf(ROOT, entry.name, name), part)
                    } catch (error: IOException) {
                        // A file that cannot be read now is left for the next run; the others still sync.
                        part.delete()
                        continue
                    }
                    // A cut-off or damaged download is dropped, so the next run fetches it again.
                    if (!unpacks(part)) {
                        part.delete()
                        continue
                    }
                    if (!part.renameTo(target)) {
                        part.delete()
                        throw IOException("The sync folder could not be written")
                    }
                }
            }
            for (file in folder.listFiles().orEmpty()) {
                if (file.name !in names) {
                    file.delete()
                }
            }
        }
    }

    /** Brings the phone's folder in the remote place in step with the local one. */
    fun push() {
        val folder = File(localRoot, ownId)
        val names = folder.listFiles().orEmpty().filter { it.isFile && SYNC_FILE.matches(it.name) }.map { it.name }.toSet()
        remote.makeFolder(listOf(ROOT))
        remote.makeFolder(listOf(ROOT, ownId))
        // Only names shaped like sync files, or like one being sent, are ever touched in the remote place.
        val there = remote.list(listOf(ROOT, ownId))
            .filter { !it.isFolder && (SYNC_FILE.matches(it.name) || SYNC_FILE.matches(it.name.removeSuffix(".tmp"))) }
            .map { it.name }.toSet()
        for (name in names.sorted()) {
            if (name !in there) {
                // Sent under another name first, so no other computer ever reads half a file.
                val part = "$name.tmp"
                remote.write(File(folder, name), listOf(ROOT, ownId, part))
                remote.rename(listOf(ROOT, ownId, part), name)
            }
        }
        for (name in there) {
            if (name !in names) {
                remote.delete(listOf(ROOT, ownId, name))
            }
        }
    }

    /** True when the file is a whole gzip file, as every sync file is. */
    private fun unpacks(file: File): Boolean = try {
        GZIPInputStream(file.inputStream()).use { stream ->
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) {
                    break
                }
                total += count
                if (total > MAX_UNPACKED_BYTES) {
                    return false
                }
            }
        }
        true
    } catch (error: IOException) {
        false
    }

    companion object {
        /** The largest sync file the engine reads, packed or unpacked, as on the desktop. */
        const val MAX_UNPACKED_BYTES = 64L * 1024 * 1024

        /** The folder inside the sync place that holds one folder per computer, as on the desktop. */
        const val ROOT = "FraiTube"
        val COMPUTER_ID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        val SYNC_FILE = Regex("^\\d{15}-\\d{4}\\.json\\.gz$")
    }
}
