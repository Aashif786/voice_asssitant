package com.handsfreeai.assistant

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

open class KeystoreManager(private val context: Context) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "assistant_voice_profile_key"
        private const val PROFILE_FILE_NAME = "voice_profile.bin"
        private const val GCM_IV_LENGTH = 12
        private const val GCM_TAG_LENGTH = 128
    }

    private val keyStore: KeyStore by lazy {
        KeyStore.getInstance(ANDROID_KEYSTORE).apply {
            load(null)
        }
    }

    private fun getOrCreateSecretKey(): SecretKey {
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (entry != null) {
                return entry.secretKey
            }
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )

        val keyGenSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(keyGenSpec)
        return keyGenerator.generateKey()
    }

    /**
     * Encrypts and writes float embedding vector to private storage.
     */
    open fun saveVoiceProfile(embedding: FloatArray): Boolean {
        return try {
            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv

            // Convert FloatArray to ByteArray
            val byteBuffer = ByteBuffer.allocate(embedding.size * 4)
            for (f in embedding) {
                byteBuffer.putFloat(f)
            }
            val plainBytes = byteBuffer.array()

            val cipherBytes = cipher.doFinal(plainBytes)

            val file = File(context.filesDir, PROFILE_FILE_NAME)
            FileOutputStream(file).use { fos ->
                fos.write(iv)
                fos.write(cipherBytes)
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Reads and decrypts stored embedding vector.
     */
    open fun loadVoiceProfile(): FloatArray? {
        val file = File(context.filesDir, PROFILE_FILE_NAME)
        if (!file.exists() || file.length() <= GCM_IV_LENGTH) {
            return null
        }

        return try {
            val fileBytes = FileInputStream(file).use { it.readBytes() }
            val iv = fileBytes.copyOfRange(0, GCM_IV_LENGTH)
            val cipherBytes = fileBytes.copyOfRange(GCM_IV_LENGTH, fileBytes.size)

            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)

            val plainBytes = cipher.doFinal(cipherBytes)
            val byteBuffer = ByteBuffer.wrap(plainBytes)
            val floatArray = FloatArray(plainBytes.size / 4)
            for (i in floatArray.indices) {
                floatArray[i] = byteBuffer.float
            }
            floatArray
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    open fun isProfileEnrolled(): Boolean {
        val file = File(context.filesDir, PROFILE_FILE_NAME)
        return file.exists() && file.length() > GCM_IV_LENGTH && keyStore.containsAlias(KEY_ALIAS)
    }

    open fun deleteVoiceProfile(): Boolean {
        return try {
            val file = File(context.filesDir, PROFILE_FILE_NAME)
            if (file.exists()) {
                file.delete()
            }
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
