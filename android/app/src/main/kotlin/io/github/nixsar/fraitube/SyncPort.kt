package io.github.nixsar.fraitube

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import java.io.File
import java.io.IOException
import org.json.JSONException
import org.json.JSONObject

/**
 * The Android side of sync: the private sync folder the engine works in, the folder picker, the saved
 * WebDAV password, and the copying between the private folder and the place the phone syncs through.
 */
internal class SyncPort(
    private val activity: Activity,
    private val deliver: (callId: String, ok: Boolean, value: String) -> Unit
) {
    val files = SyncFiles(activity)
    private val password = SecretStore(activity, "webdav")
    private val preferences = activity.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private var pendingChoice: String? = null

    fun setPassword(secret: String): String = try {
        password.set(secret)
        ""
    } catch (error: IOException) {
        error.message ?: "The password could not be saved"
    }

    fun hasPassword(): Boolean = password.has()

    /** Opens the folder picker. Call on the main thread. The answer is the folder's name, or an empty text when none was chosen. */
    fun chooseFolder(callId: String) {
        if (pendingChoice != null) {
            deliver(callId, false, "Another folder is being chosen")
            return
        }
        pendingChoice = callId
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        activity.startActivityForResult(intent, FOLDER_CODE)
    }

    /** Takes the folder picker's answer. True when the result was this picker's. */
    fun onResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != FOLDER_CODE) {
            return false
        }
        val callId = pendingChoice ?: return true
        pendingChoice = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            deliver(callId, true, "")
            return true
        }
        val access = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            activity.contentResolver.takePersistableUriPermission(uri, access)
        } catch (error: SecurityException) {
            deliver(callId, false, "That folder does not allow lasting access")
            return true
        }
        // Access to the folder chosen before is given back.
        preferences.getString(FOLDER, null)?.let { old ->
            if (old != uri.toString()) {
                try {
                    activity.contentResolver.releasePersistableUriPermission(Uri.parse(old), access)
                } catch (error: SecurityException) {
                    // The access was gone already.
                }
            }
        }
        preferences.edit().putString(FOLDER, uri.toString()).apply()
        deliver(callId, true, folderName(uri))
        return true
    }

    private fun folderName(tree: Uri): String {
        val document = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        try {
            activity.contentResolver.query(document, arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst() && !cursor.isNull(0)) {
                    return cursor.getString(0)
                }
            }
        } catch (error: RuntimeException) {
            // The app that holds the folder gave no name for it.
        }
        return tree.lastPathSegment ?: "Chosen folder"
    }

    /**
     * Copies sync files in ("pull") or out ("push") in the background. The details are JSON: the mode,
     * "folder" or "webdav", this phone's computer ID, and for WebDAV the address and user name. The
     * answer is an empty text, or the error.
     */
    fun transfer(callId: String, direction: String, details: String) {
        Thread {
            val (ok, value) = try {
                val json = JSONObject(details)
                val remote = when (json.getString("mode")) {
                    "folder" -> {
                        val folder = preferences.getString(FOLDER, null) ?: throw IOException("Choose a sync folder")
                        FolderRemote(activity.contentResolver, Uri.parse(folder))
                    }
                    "webdav" -> WebDavRemote(json.getString("address"), json.getString("user"), password.get())
                    else -> throw IOException("Unknown sync mode")
                }
                val transfer = SyncTransfer(File(files.root, SyncTransfer.ROOT), remote, json.getString("computerId"))
                when (direction) {
                    "pull" -> transfer.pull()
                    "push" -> transfer.push()
                    else -> throw IOException("Unknown sync direction")
                }
                true to ""
            } catch (error: IOException) {
                false to (error.message ?: "The sync place could not be reached")
            } catch (error: JSONException) {
                false to "The sync details are not valid"
            } catch (error: IllegalArgumentException) {
                false to (error.message ?: "The sync details are not valid")
            }
            activity.runOnUiThread { deliver(callId, ok, value) }
        }.start()
    }

    private companion object {
        const val FOLDER_CODE = 4103
        const val FOLDER = "folder"
    }
}
