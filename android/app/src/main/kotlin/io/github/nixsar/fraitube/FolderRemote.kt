package io.github.nixsar.fraitube

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

/**
 * A folder the user picked with Android's folder picker, on the phone or offered by another app such
 * as a cloud storage app. It is reached through Android's documents interface.
 */
internal class FolderRemote(private val resolver: ContentResolver, private val tree: Uri) : SyncRemote {
    private class Child(val id: String, val name: String, val isFolder: Boolean)

    private val rootId: String = DocumentsContract.getTreeDocumentId(tree)

    private fun children(folderId: String): List<Child> {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, folderId)
        val found = ArrayList<Child>()
        val cursor = guarded {
            resolver.query(uri, arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE), null, null, null)
        } ?: throw IOException("The sync folder could not be read")
        cursor.use {
            while (it.moveToNext()) {
                found.add(Child(it.getString(0), it.getString(1) ?: "", it.getString(2) == Document.MIME_TYPE_DIR))
            }
        }
        return found
    }

    private fun find(path: List<String>): Child? {
        var current = Child(rootId, "", true)
        for (name in path) {
            current = children(current.id).firstOrNull { it.name == name } ?: return null
        }
        return current
    }

    private fun need(path: List<String>): Child = find(path) ?: throw IOException("The sync folder has no ${path.joinToString("/")}")

    private fun uriOf(id: String): Uri = DocumentsContract.buildDocumentUriUsingTree(tree, id)

    /** Turns the errors a storage app answers with into one kind the sync reports. */
    private fun <T> guarded(work: () -> T): T = try {
        work()
    } catch (error: FileNotFoundException) {
        throw IOException("The sync folder could not be reached")
    } catch (error: SecurityException) {
        throw IOException("FraiTube no longer has access to the sync folder. Choose it again.")
    } catch (error: IllegalArgumentException) {
        throw IOException("The sync folder could not be reached")
    } catch (error: IllegalStateException) {
        throw IOException("The sync folder could not be reached")
    } catch (error: UnsupportedOperationException) {
        throw IOException("The app that holds the sync folder does not allow this")
    }

    override fun list(folder: List<String>): List<SyncRemote.Entry> =
        children(need(folder).id).map { SyncRemote.Entry(it.name, it.isFolder) }

    override fun makeFolder(folder: List<String>) {
        val parent = need(folder.dropLast(1))
        if (children(parent.id).none { it.name == folder.last() && it.isFolder }) {
            guarded { DocumentsContract.createDocument(resolver, uriOf(parent.id), Document.MIME_TYPE_DIR, folder.last()) }
                ?: throw IOException("The folder ${folder.last()} could not be made")
        }
    }

    override fun read(file: List<String>, target: File) {
        val input = guarded { resolver.openInputStream(uriOf(need(file).id)) } ?: throw IOException("The sync file could not be read")
        input.use { source -> target.outputStream().use { source.copyTo(it) } }
    }

    override fun write(source: File, file: List<String>) {
        val parent = need(file.dropLast(1))
        children(parent.id).filter { it.name == file.last() }.forEach { old ->
            guarded { DocumentsContract.deleteDocument(resolver, uriOf(old.id)) }
        }
        val created = guarded { DocumentsContract.createDocument(resolver, uriOf(parent.id), "application/octet-stream", file.last()) }
            ?: throw IOException("The sync file could not be written")
        val output = guarded { resolver.openOutputStream(created) } ?: throw IOException("The sync file could not be written")
        output.use { target -> source.inputStream().use { it.copyTo(target) } }
    }

    override fun rename(file: List<String>, newName: String) {
        val parent = need(file.dropLast(1))
        val all = children(parent.id)
        all.filter { it.name == newName }.forEach { old -> guarded { DocumentsContract.deleteDocument(resolver, uriOf(old.id)) } }
        val current = all.firstOrNull { it.name == file.last() } ?: throw IOException("The sync file could not be renamed")
        guarded { DocumentsContract.renameDocument(resolver, uriOf(current.id), newName) }
            ?: throw IOException("The sync file could not be renamed")
    }

    override fun delete(file: List<String>) {
        val found = find(file) ?: return
        guarded { DocumentsContract.deleteDocument(resolver, uriOf(found.id)) }
    }
}
