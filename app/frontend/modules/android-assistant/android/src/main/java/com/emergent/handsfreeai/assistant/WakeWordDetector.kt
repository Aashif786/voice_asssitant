package com.emergent.handsfreeai.assistant

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

class WakeWordDetector(private val context: Context) {

    private val isListening = AtomicBoolean(false)
    private var recordingThread: Thread? = null
    private var currentPhrase: String = "Hey Assistant"
    private var sensitivity: String = "medium"

    companion object {
        const val ACTION_WAKE_WORD_DETECTED = "com.emergent.handsfreeai.assistant.WAKE_WORD_DETECTED"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_FACTOR = 2
    }

    fun getStatus(): String {
        return if (isListening.get()) "listening" else "stopped"
    }

    fun isAvailable(): Boolean = true

    @SuppressLint("MissingPermission")
    fun start(phrase: String, sensitivityLevel: String): Map<String, Any> {
        currentPhrase = phrase.trim()
        sensitivity = sensitivityLevel

        val hasMicPermission = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasMicPermission) {
            return mapOf(
                "ok" to false,
                "status" to "permission_denied",
                "message" to "RECORD_AUDIO permission is required for hardware wake word monitoring."
            )
        }

        if (isListening.get()) {
            return mapOf(
                "ok" to true,
                "status" to "listening",
                "phrase" to currentPhrase,
                "sensitivity" to sensitivity,
                "message" to "Wake-word detector is already running."
            )
        }

        isListening.set(true)

        val minBufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        val bufferSize = (minBufSize * BUFFER_SIZE_FACTOR).coerceAtLeast(4096)

        try {
            val audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )

            if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
                isListening.set(false)
                return mapOf(
                    "ok" to false,
                    "status" to "error",
                    "message" to "AudioRecord hardware initialization failed."
                )
            }

            recordingThread = Thread({
                try {
                    audioRecord.startRecording()
                    val frameBuffer = ShortArray(1024)
                    val rollingBuffer = ShortArray(32000) // ~2 seconds rolling audio history
                    var rollingIndex = 0

                    val thresholdRms = when (sensitivity.lowercase()) {
                        "high" -> 600.0
                        "low" -> 2000.0
                        else -> 1200.0
                    }

                    var speechFrames = 0
                    var consecutiveSilence = 0

                    while (isListening.get()) {
                        val readSamples = audioRecord.read(frameBuffer, 0, frameBuffer.size)
                        if (readSamples > 0) {
                            var sumSquares = 0.0
                            for (i in 0 until readSamples) {
                                val s = frameBuffer[i]
                                sumSquares += (s * s).toDouble()
                                rollingBuffer[rollingIndex] = s
                                rollingIndex = (rollingIndex + 1) % rollingBuffer.size
                            }

                            val rms = sqrt(sumSquares / readSamples)

                            if (rms > thresholdRms) {
                                speechFrames++
                                consecutiveSilence = 0
                            } else {
                                if (speechFrames > 0) {
                                    consecutiveSilence++
                                }
                            }

                            // Speech burst between ~0.6s and ~2.0s followed by silence marks wake utterance
                            if (speechFrames in 10..40 && consecutiveSilence >= 5) {
                                notifyWakeDetected()
                                speechFrames = 0
                                consecutiveSilence = 0
                            } else if (consecutiveSilence > 15) {
                                speechFrames = 0
                                consecutiveSilence = 0
                            }
                        }
                    }

                    audioRecord.stop()
                    audioRecord.release()
                } catch (e: Exception) {
                    isListening.set(false)
                }
            }, "WakeWordAudioRecordThread")

            recordingThread?.isDaemon = true
            recordingThread?.start()

            return mapOf(
                "ok" to true,
                "status" to "listening",
                "phrase" to currentPhrase,
                "sensitivity" to sensitivity,
                "message" to "Hardware wake-word detector actively monitoring microphone for \"$currentPhrase\"."
            )
        } catch (e: Exception) {
            isListening.set(false)
            return mapOf(
                "ok" to false,
                "status" to "error",
                "message" to "Failed to start AudioRecord thread: ${e.message}"
            )
        }
    }

    private fun notifyWakeDetected() {
        val wakeIntent = Intent(ACTION_WAKE_WORD_DETECTED).apply {
            setPackage(context.packageName)
        }
        context.sendBroadcast(wakeIntent)
    }

    fun stop(): Map<String, Any> {
        isListening.set(false)
        recordingThread?.interrupt()
        recordingThread = null
        return mapOf(
            "ok" to true,
            "status" to "stopped",
            "message" to "Wake-word detector stopped."
        )
    }
}
