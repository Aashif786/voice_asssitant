package com.handsfreeai.assistant

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat

class CallManager(private val context: Context) {

    fun hasDirectCallPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Safe Dialer Mode: Pre-fills dialer with number. Does not require CALL_PHONE permission.
     */
    fun dial(number: String): Map<String, Any> {
        val cleanNumber = number.replace(Regex("[^0-9+]"), "")
        if (cleanNumber.isEmpty()) {
            return mapOf("success" to false, "message" to "Invalid phone number provided.")
        }

        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanNumber")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return try {
            context.startActivity(intent)
            mapOf(
                "success" to true,
                "mode" to "dialer",
                "number" to cleanNumber,
                "message" to "Opened dialer for $cleanNumber."
            )
        } catch (e: Exception) {
            mapOf("success" to false, "message" to "Failed to open dialer: ${e.message}")
        }
    }

    /**
     * Direct Call Mode: Initiates immediate direct call via Intent.ACTION_CALL.
     */
    fun call(number: String, allowFallbackToDial: Boolean = false): Map<String, Any> {
        val cleanNumber = number.replace(Regex("[^0-9+]"), "")
        if (cleanNumber.isEmpty()) {
            return mapOf("success" to false, "message" to "Invalid phone number provided.")
        }

        if (hasDirectCallPermission()) {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$cleanNumber")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            return try {
                context.startActivity(intent)
                mapOf(
                    "success" to true,
                    "mode" to "direct",
                    "number" to cleanNumber,
                    "message" to "Calling $cleanNumber directly."
                )
            } catch (e: Exception) {
                if (allowFallbackToDial) dial(cleanNumber)
                else mapOf("success" to false, "message" to "Failed to initiate call: ${e.message}")
            }
        }

        // Fallback to dialer if CALL_PHONE is not granted
        return if (allowFallbackToDial) {
            dial(cleanNumber)
        } else {
            mapOf(
                "success" to false,
                "mode" to "permission_needed",
                "message" to "CALL_PHONE permission is required for direct calling."
            )
        }
    }
}
