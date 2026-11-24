package com.handsfreeai.assistant

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.net.URLEncoder

class MessageDispatcher(private val context: Context) {

    fun openWhatsApp(number: String?, message: String): Map<String, Any> {
        val encodedMessage = try {
            URLEncoder.encode(message, "UTF-8")
        } catch (e: Exception) {
            Uri.encode(message)
        }

        val cleanNumber = number?.replace(Regex("[^0-9+]"), "")

        val uri = if (!cleanNumber.isNullOrEmpty()) {
            // WhatsApp Click to Chat URL format: numbers with country code without leading '+' or special chars
            val phoneDigits = cleanNumber.replace("+", "")
            Uri.parse("https://api.whatsapp.com/send?phone=$phoneDigits&text=$encodedMessage")
        } else {
            Uri.parse("whatsapp://send?text=$encodedMessage")
        }

        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            setPackage("com.whatsapp")
        }

        return try {
            context.startActivity(intent)
            mapOf(
                "success" to true,
                "app" to "whatsapp",
                "recipient" to (cleanNumber ?: "Contact"),
                "message" to if (!cleanNumber.isNullOrEmpty()) {
                    "Opened WhatsApp conversation for $cleanNumber with message: \"$message\" prefilled. Please tap send in WhatsApp to dispatch."
                } else {
                    "Opened WhatsApp with message: \"$message\" prefilled. Please select a contact and tap send."
                }
            )
        } catch (e: Exception) {
            // Try WhatsApp Business package
            try {
                val wbIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    setPackage("com.whatsapp.w4b")
                }
                context.startActivity(wbIntent)
                mapOf(
                    "success" to true,
                    "app" to "whatsapp_business",
                    "recipient" to (cleanNumber ?: "Contact"),
                    "message" to "Opened WhatsApp Business with message: \"$message\" prefilled. Please tap send in WhatsApp."
                )
            } catch (e2: Exception) {
                // Try generic intent
                try {
                    val genericIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(genericIntent)
                    mapOf(
                        "success" to true,
                        "app" to "whatsapp_handler",
                        "recipient" to (cleanNumber ?: "Contact"),
                        "message" to "Opened WhatsApp with message prefilled."
                    )
                } catch (e3: Exception) {
                    mapOf(
                        "success" to false,
                        "message" to "WhatsApp is not installed on this device."
                    )
                }
            }
        }
    }

    fun openSms(number: String?, message: String): Map<String, Any> {
        val cleanNumber = number?.replace(Regex("[^0-9+]"), "") ?: ""
        val uri = Uri.parse("smsto:$cleanNumber")
        val intent = Intent(Intent.ACTION_SENDTO, uri).apply {
            putExtra("sms_body", message)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return try {
            context.startActivity(intent)
            mapOf(
                "success" to true,
                "app" to "sms",
                "recipient" to cleanNumber,
                "message" to "Prepared SMS message for $cleanNumber: \"$message\". Please tap send."
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "No SMS application available on this device: ${e.message}"
            )
        }
    }
}
