package com.handsfreeai.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AssistantForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "assistant_listening_channel"
        const val NOTIFICATION_ID = 2001

        const val ACTION_START = "com.handsfreeai.assistant.START"
        const val ACTION_STOP = "com.handsfreeai.assistant.STOP"

        const val EXTRA_PHRASE = "extra_phrase"
        const val EXTRA_SENSITIVITY = "extra_sensitivity"

        @Volatile
        var isServiceRunning = false
            private set

        @Volatile
        var activeInstance: AssistantForegroundService? = null
            private set

        fun startListening(context: Context, phrase: String, sensitivity: String) {
            val intent = Intent(context, AssistantForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_PHRASE, phrase)
                putExtra(EXTRA_SENSITIVITY, sensitivity)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopListening(context: Context) {
            // Avoid throwing IllegalStateException on Android 8+ when stopping while app is in background.
            // When isServiceRunning is false, avoid redundant calls.
            // Using context.stopService(intent) cleanly terminates the service without background start restrictions.
            if (!isServiceRunning) return
            try {
                val intent = Intent(context, AssistantForegroundService::class.java)
                context.stopService(intent)
            } catch (e: Exception) {
                android.util.Log.w("AssistantForegroundService", "Error stopping listening service: ${e.message}")
            }
        }

        fun requestTransientFocus(): Boolean = activeInstance?.requestTransientAudioFocus() ?: false
        fun abandonTransientFocus() { activeInstance?.abandonTransientAudioFocus() }
    }

    private var phrase: String = "Hey Assistant"
    private var sensitivity: String = "medium"
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private val wakeWordDetector by lazy { WakeWordDetector(applicationContext) }

    private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Focus lost during active playback/capture
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                // Focus regained
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        activeInstance = this
        createNotificationChannel()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        // Permanent AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK removed:
        // Passive wake-word monitoring must not continuously hold audio focus or duck media.
        // Audio focus is requested transiently only during active command capture / speech playback.
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null || intent.action == ACTION_STOP) {
            stopForegroundService()
            return START_NOT_STICKY
        }

        if (intent.action == ACTION_START) {
            phrase = intent.getStringExtra(EXTRA_PHRASE) ?: "Hey Assistant"
            sensitivity = intent.getStringExtra(EXTRA_SENSITIVITY) ?: "medium"

            val notification = buildNotification(phrase)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }

            isServiceRunning = true
            wakeWordDetector.start(phrase, sensitivity)
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isServiceRunning = false
        wakeWordDetector.stop()
        abandonTransientAudioFocus()
        if (activeInstance == this) {
            activeInstance = null
        }
        super.onDestroy()
    }

    private fun stopForegroundService() {
        isServiceRunning = false
        wakeWordDetector.stop()
        abandonTransientAudioFocus()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Assistant Listening",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows when the assistant is listening hands-free for your wake phrase."
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(activePhrase: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val stopIntent = Intent(this, AssistantForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Assistant is listening")
            .setContentText("Wake phrase: \"$activePhrase\" · Owner-only active")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Pause Listening", stopPendingIntent)
            .build()
    }

    fun requestTransientAudioFocus(): Boolean {
        if (audioManager == null) {
            audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        }
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val playbackAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()

                focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(false)
                    .setOnAudioFocusChangeListener(audioFocusChangeListener)
                    .build()

                val result = audioManager?.requestAudioFocus(focusRequest!!)
                result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            } else {
                @Suppress("DEPRECATION")
                val result = audioManager?.requestAudioFocus(
                    audioFocusChangeListener,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                )
                result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
        } catch (e: Exception) {
            android.util.Log.w("AssistantForegroundService", "Failed to request transient audio focus: ${e.message}")
            false
        }
    }

    fun abandonTransientAudioFocus() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
                focusRequest = null
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(audioFocusChangeListener)
            }
        } catch (e: Exception) {
            android.util.Log.w("AssistantForegroundService", "Failed to abandon audio focus: ${e.message}")
        }
    }
}
