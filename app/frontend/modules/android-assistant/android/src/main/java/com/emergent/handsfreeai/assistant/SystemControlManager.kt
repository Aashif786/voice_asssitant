package com.emergent.handsfreeai.assistant

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.BatteryManager
import android.provider.AlarmClock

class SystemControlManager(private val context: Context) {

    private var isTorchOn = false

    fun setFlashlight(enabled: Boolean): Map<String, Any> {
        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
            ?: return mapOf("success" to false, "message" to "Camera service unavailable.")

        try {
            for (id in cameraManager.cameraIdList) {
                val chars = cameraManager.getCameraCharacteristics(id)
                val flashAvailable = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) ?: false
                if (flashAvailable) {
                    cameraManager.setTorchMode(id, enabled)
                    isTorchOn = enabled
                    val state = if (enabled) "on" else "off"
                    return mapOf(
                        "success" to true,
                        "state" to enabled,
                        "message" to "Flashlight turned $state."
                    )
                }
            }
            return mapOf("success" to false, "message" to "No camera with flashlight found.")
        } catch (e: Exception) {
            return mapOf("success" to false, "message" to "Failed to toggle flashlight: ${e.message}")
        }
    }

    fun toggleFlashlight(): Map<String, Any> {
        return setFlashlight(!isTorchOn)
    }

    fun getBatteryStatus(): Map<String, Any> {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = context.registerReceiver(null, filter)

        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

        val percentage = if (level >= 0 && scale > 0) {
            (level * 100) / scale
        } else {
            -1
        }

        val stateDesc = if (isCharging) "charging" else "discharging"
        val message = if (percentage >= 0) {
            "Battery is at $percentage% and currently $stateDesc."
        } else {
            "Battery status unavailable."
        }

        return mapOf(
            "success" to (percentage >= 0),
            "percentage" to percentage,
            "isCharging" to isCharging,
            "message" to message
        )
    }

    fun setVolume(stream: String, percentage: Int): Map<String, Any> {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return mapOf("success" to false, "message" to "Audio service unavailable.")

        val streamType = when (stream.lowercase().trim()) {
            "call", "voice" -> AudioManager.STREAM_VOICE_CALL
            "alarm" -> AudioManager.STREAM_ALARM
            "ring", "notification" -> AudioManager.STREAM_RING
            else -> AudioManager.STREAM_MUSIC
        }

        val max = audioManager.getStreamMaxVolume(streamType)
        val clampedPct = percentage.coerceIn(0, 100)
        val targetVolume = (max * clampedPct) / 100

        try {
            audioManager.setStreamVolume(streamType, targetVolume, AudioManager.FLAG_SHOW_UI)
            return mapOf(
                "success" to true,
                "stream" to stream,
                "percentage" to clampedPct,
                "volume" to targetVolume,
                "max" to max,
                "message" to "Set $stream volume to $clampedPct%."
            )
        } catch (e: Exception) {
            return mapOf("success" to false, "message" to "Could not set volume: ${e.message}")
        }
    }

    fun getVolume(stream: String): Map<String, Any> {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return mapOf("success" to false, "message" to "Audio service unavailable.")

        val streamType = when (stream.lowercase().trim()) {
            "call", "voice" -> AudioManager.STREAM_VOICE_CALL
            "alarm" -> AudioManager.STREAM_ALARM
            "ring", "notification" -> AudioManager.STREAM_RING
            else -> AudioManager.STREAM_MUSIC
        }

        val max = audioManager.getStreamMaxVolume(streamType)
        val current = audioManager.getStreamVolume(streamType)
        val percentage = if (max > 0) (current * 100) / max else 0

        return mapOf(
            "success" to true,
            "stream" to stream,
            "current" to current,
            "max" to max,
            "percentage" to percentage,
            "message" to "$stream volume is at $percentage% ($current/$max)."
        )
    }

    fun setAlarm(hour: Int, minute: Int, message: String): Map<String, Any> {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, hour)
            putExtra(AlarmClock.EXTRA_MINUTES, minute)
            putExtra(AlarmClock.EXTRA_MESSAGE, message)
            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return try {
            context.startActivity(intent)
            val timeFormatted = String.format("%02d:%02d", hour, minute)
            mapOf(
                "success" to true,
                "hour" to hour,
                "minute" to minute,
                "message" to "Alarm set for $timeFormatted: \"$message\""
            )
        } catch (e: Exception) {
            mapOf("success" to false, "message" to "Alarm app not available: ${e.message}")
        }
    }

    fun setTimer(seconds: Int, message: String): Map<String, Any> {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            putExtra(AlarmClock.EXTRA_MESSAGE, message)
            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return try {
            context.startActivity(intent)
            val mins = seconds / 60
            val secs = seconds % 60
            val durStr = if (mins > 0) "$mins min ${secs}s" else "${secs}s"
            mapOf(
                "success" to true,
                "seconds" to seconds,
                "message" to "Timer set for $durStr: \"$message\""
            )
        } catch (e: Exception) {
            mapOf("success" to false, "message" to "Timer app not available: ${e.message}")
        }
    }

    fun getAudioRoutingEnvironment(): Map<String, Any> {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return mapOf("success" to false, "mode" to "unknown")

        @Suppress("DEPRECATION")
        val isBtA2dp = audioManager.isBluetoothA2dpOn
        @Suppress("DEPRECATION")
        val isBtSco = audioManager.isBluetoothScoOn
        @Suppress("DEPRECATION")
        val isWired = audioManager.isWiredHeadsetOn
        val isSpeaker = audioManager.isSpeakerphoneOn

        val isDrivingLikely = isBtA2dp || isBtSco

        val modeName = when {
            isDrivingLikely -> "bluetooth_vehicle_or_headset"
            isWired -> "wired_headset"
            isSpeaker -> "speakerphone"
            else -> "handset"
        }

        return mapOf(
            "success" to true,
            "mode" to modeName,
            "isBluetoothConnected" to (isBtA2dp || isBtSco),
            "isDrivingLikely" to isDrivingLikely,
            "message" to "Audio routing: $modeName (Driving mode: ${if (isDrivingLikely) "Active" else "Inactive"})"
        )
    }
}
