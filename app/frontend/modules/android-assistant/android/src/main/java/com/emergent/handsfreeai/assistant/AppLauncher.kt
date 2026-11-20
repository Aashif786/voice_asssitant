package com.emergent.handsfreeai.assistant

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings

data class AppInfo(
    val name: String,
    val packageName: String
)

class AppLauncher(private val context: Context) {

    private val commonAliases = mapOf(
        "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
        "wa" to listOf("com.whatsapp"),
        "youtube" to listOf("com.google.android.youtube"),
        "yt" to listOf("com.google.android.youtube"),
        "chrome" to listOf("com.android.chrome"),
        "browser" to listOf("com.android.chrome", "org.mozilla.firefox", "com.microsoft.emmx"),
        "camera" to listOf("com.android.camera", "com.google.android.GoogleCamera", "com.oneplus.camera", "com.oplus.camera"),
        "photos" to listOf("com.google.android.apps.photos", "com.coloros.gallery3d", "com.oneplus.gallery"),
        "gallery" to listOf("com.google.android.apps.photos", "com.coloros.gallery3d", "com.oneplus.gallery"),
        "settings" to listOf("com.android.settings"),
        "phone" to listOf("com.google.android.dialer", "com.android.dialer"),
        "dialer" to listOf("com.google.android.dialer", "com.android.dialer"),
        "messages" to listOf("com.google.android.apps.messaging", "com.android.mms"),
        "sms" to listOf("com.google.android.apps.messaging", "com.android.mms"),
        "spotify" to listOf("com.spotify.music"),
        "maps" to listOf("com.google.android.apps.maps"),
        "google maps" to listOf("com.google.android.apps.maps"),
        "gmail" to listOf("com.google.android.gm"),
        "mail" to listOf("com.google.android.gm"),
        "calculator" to listOf("com.google.android.calculator", "com.coloros.calculator"),
        "clock" to listOf("com.google.android.deskclock", "com.coloros.alarmclock"),
        "calendar" to listOf("com.google.android.calendar"),
        "files" to listOf("com.google.android.apps.nbu.files", "com.google.android.documentsui", "com.coloros.filemanager"),
        "contacts" to listOf("com.google.android.contacts", "com.android.contacts")
    )

    fun getInstalledApps(): List<Map<String, String>> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolveInfos = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
        val apps = mutableListOf<Map<String, String>>()

        for (resolveInfo in resolveInfos) {
            val label = resolveInfo.loadLabel(pm)?.toString() ?: ""
            val packageName = resolveInfo.activityInfo.packageName
            if (label.isNotEmpty() && packageName.isNotEmpty()) {
                apps.add(
                    mapOf(
                        "name" to label,
                        "packageName" to packageName
                    )
                )
            }
        }
        return apps.sortedBy { it["name"]?.lowercase() }
    }

    fun openApp(packageName: String): Boolean {
        val pm = context.packageManager
        val launchIntent = pm.getLaunchIntentForPackage(packageName) ?: return false
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        context.startActivity(launchIntent)
        return true
    }

    fun openAppByName(name: String): Map<String, Any> {
        val query = name.trim().lowercase()

        // 1. Check known aliases first for fast, reliable package launch
        if (commonAliases.containsKey(query)) {
            val potentialPkgs = commonAliases[query] ?: emptyList()
            for (pkg in potentialPkgs) {
                if (openApp(pkg)) {
                    val label = query.replaceFirstChar { it.uppercase() }
                    return mapOf(
                        "success" to true,
                        "name" to label,
                        "packageName" to pkg,
                        "message" to "Opened $label."
                    )
                }
            }
        }

        val apps = getInstalledApps()

        // 2. Exact match
        var match = apps.firstOrNull { it["name"]?.trim()?.lowercase() == query }

        // 3. Starts-with match
        if (match == null) {
            match = apps.firstOrNull { it["name"]?.trim()?.lowercase()?.startsWith(query) == true }
        }

        // 4. Substring match
        if (match == null) {
            match = apps.firstOrNull { it["name"]?.trim()?.lowercase()?.contains(query) == true }
        }

        if (match != null) {
            val pkg = match["packageName"] ?: ""
            val success = openApp(pkg)
            val appLabel = match["name"] ?: name
            return mapOf(
                "success" to success,
                "name" to appLabel,
                "packageName" to pkg,
                "message" to if (success) "Opened $appLabel." else "Failed to launch $appLabel."
            )
        }

        return mapOf(
            "success" to false,
            "message" to "No installed app found matching '$name'. Please verify that the application is installed."
        )
    }

    fun openSettings(settingType: String): Boolean {
        val action = when (settingType.lowercase().trim()) {
            "wifi", "wi-fi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "sound", "volume", "audio" -> Settings.ACTION_SOUND_SETTINGS
            "battery", "power" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
            "display", "brightness" -> Settings.ACTION_DISPLAY_SETTINGS
            "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
            "app", "details" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }

        val intent = Intent(action).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (action == Settings.ACTION_APPLICATION_DETAILS_SETTINGS) {
                data = Uri.fromParts("package", context.packageName, null)
            }
        }

        return try {
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun navigateHome(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
