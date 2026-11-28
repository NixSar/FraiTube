package io.github.nixsar.fraitube

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONException
import org.json.JSONObject

/**
 * A secret that belongs to one address, such as the WebDAV password. It is kept together with that
 * address and handed out only for it, so a changed address never receives the old secret.
 */
internal class AddressSecret(private val store: SecretStore) {
    /** Saves the secret for the address; an empty secret removes it. */
    fun set(address: String, secret: String) {
        store.set(if (secret.isEmpty()) "" else JSONObject().put("address", address.trim()).put("secret", secret).toString())
    }

    /** The secret saved for this very address, or null. */
    fun forAddress(address: String): String? = try {
        val saved = store.get()
        if (saved.isEmpty()) {
            null
        } else {
            val json = JSONObject(saved)
            if (json.getString("address") == address.trim()) json.getString("secret") else null
        }
    } catch (error: JSONException) {
        null
    }
}

/**
 * Keeps one secret text, the WebDAV password, in the app's private files, encrypted with a key that
 * Android's key store holds and never hands out. The secret is not part of backups or sync, and the
 * page can set it but never read it.
 */
internal class SecretStore(context: Context, name: String) {
    private val file = File(context.filesDir, "$name.secret")
    private val alias = "fraitube-$name"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEY_STORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Saves the secret, replacing the one saved before. An empty text removes it. */
    fun set(secret: String) {
        if (secret.isEmpty()) {
            file.delete()
            return
        }
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            file.writeBytes(cipher.iv + cipher.doFinal(secret.toByteArray(Charsets.UTF_8)))
        } catch (error: GeneralSecurityException) {
            throw IOException("The password could not be saved")
        }
    }

    fun has(): Boolean = file.isFile

    /** The saved secret, or an empty text when none is saved or it can no longer be read. */
    fun get(): String {
        if (!file.isFile) {
            return ""
        }
        return try {
            val bytes = file.readBytes()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (error: GeneralSecurityException) {
            ""
        } catch (error: IOException) {
            ""
        }
    }

    private companion object {
        const val KEY_STORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
