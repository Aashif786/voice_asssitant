package com.emergent.handsfreeai.assistant

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ConcurrentLinkedDeque

class AssistantNotificationListener : NotificationListenerService() {

    data class NotificationItem(
        val id: String,
        val packageName: String,
        val appName: String,
        val title: String,
        val text: String,
        val timestamp: Long
    ) {
        fun toMap(): Map<String, Any> {
            return mapOf(
                "id" to id,
                "packageName" to packageName,
                "appName" to appName,
                "title" to title,
                "text" to text,
                "timestamp" to timestamp
            )
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkg = sbn.packageName ?: return
        // Ignore self notifications to avoid loops
        if (pkg == applicationContext.packageName) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: ""

        if (title.isBlank() && text.isBlank()) return

        val appName = try {
            val appInfo = packageManager.getApplicationInfo(pkg, 0)
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
            pkg
        }

        val item = NotificationItem(
            id = "${sbn.key}_${sbn.postTime}",
            packageName = pkg,
            appName = appName,
            title = title,
            text = text,
            timestamp = sbn.postTime
        )

        addNotification(item)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }

    companion object {
        private const val MAX_HISTORY = 40
        private val history = ConcurrentLinkedDeque<NotificationItem>()

        @Synchronized
        fun addNotification(item: NotificationItem) {
            // Remove duplicates by id if already present
            val iterator = history.iterator()
            while (iterator.hasNext()) {
                if (iterator.next().id == item.id) {
                    iterator.remove()
                }
            }

            history.addFirst(item)
            while (history.size > MAX_HISTORY) {
                history.removeLast()
            }
        }

        fun getRecent(limit: Int = 10): List<Map<String, Any>> {
            return history.take(limit).map { it.toMap() }
        }

        fun clear() {
            history.clear()
        }

        fun isAccessGranted(context: Context): Boolean {
            val pkgName = context.packageName
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: return false

            val names = flat.split(":")
            for (name in names) {
                val cn = android.content.ComponentName.unflattenFromString(name)
                if (cn != null && cn.packageName == pkgName) {
                    return true
                }
            }
            return false
        }

        fun openSettings(context: Context): Boolean {
            return try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                true
            } catch (e: Exception) {
                false
            }
        }
    }
}
