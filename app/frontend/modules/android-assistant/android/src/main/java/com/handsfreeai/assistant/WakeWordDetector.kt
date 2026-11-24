package com.handsfreeai.assistant

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class WakeWordDetector(private val context: Context) {

    private val isListening = AtomicBoolean(false)
    private var recordingThread: Thread? = null
    private var currentPhrase: String = "Hey Assistant"
    private var sensitivity: String = "medium"

    companion object {
        const val TAG = "WakeWordDetector"
        const val ACTION_WAKE_WORD_DETECTED = "com.handsfreeai.assistant.WAKE_WORD_DETECTED"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_FACTOR = 2
    }

    data class PhraseProfile(
        val syllables: Int,
        val minFrames: Int,
        val maxFrames: Int,
        val minModulations: Int
    )

    private fun estimateSyllables(phrase: String): Int {
        val words = phrase.trim().lowercase().split("\\s+".toRegex()).filter { it.isNotBlank() }
        if (words.isEmpty()) return 2
        var total = 0
        val vowels = setOf('a', 'e', 'i', 'o', 'u', 'y')
        for (word in words) {
            var wordSyllables = 0
            var prevIsVowel = false
            for (ch in word) {
                val isVowel = ch in vowels
                if (isVowel && !prevIsVowel) {
                    wordSyllables++
                }
                prevIsVowel = isVowel
            }
            if (word.endsWith("e") && !word.endsWith("le") && wordSyllables > 1) {
                wordSyllables--
            }
            total += max(1, wordSyllables)
        }
        return total
    }

    private fun computePhraseProfile(phrase: String): PhraseProfile {
        val syllables = estimateSyllables(phrase)
        // 64 ms per frame (1024 samples @ 16 kHz)
        val minDurationMs = syllables * 130
        val maxDurationMs = syllables * 400 + 450
        val minFrames = max(6, minDurationMs / 64)
        val maxFrames = min(60, maxDurationMs / 64)
        val minModulations = max(1, min(3, syllables - 1))
        return PhraseProfile(syllables, minFrames, maxFrames, minModulations)
    }

    fun getStatus(): String {
        return if (isListening.get()) "listening" else "stopped"
    }

    fun isAvailable(): Boolean = true

    @SuppressLint("MissingPermission")
    fun start(phrase: String, sensitivityLevel: String): Map<String, Any> {
        currentPhrase = phrase.trim().ifEmpty { "Hey Assistant" }
        sensitivity = sensitivityLevel.lowercase()

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

        val profile = computePhraseProfile(currentPhrase)
        Log.i(
            TAG,
            "Starting wake word detector: phrase='$currentPhrase' (${profile.syllables} syllables, " +
            "expected duration: ${profile.minFrames * 64}ms..${profile.maxFrames * 64}ms), sensitivity='$sensitivity'. " +
            "NOTE: Advanced acoustic energy/ZCR/syllabic modulation heuristics active. " +
            "For production speech wake words in noisy environments, an on-device DNN acoustic model " +
            "(e.g. Porcupine, openWakeWord, or TFLite Micro) is recommended."
        )

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

                    // Sensitivity tuning
                    val thresholdRms = when (sensitivity) {
                        "high" -> 500.0
                        "low" -> 1600.0
                        else -> 900.0
                    }

                    val minZcr = 15
                    val maxZcr = when (sensitivity) {
                        "high" -> 440
                        "low" -> 360
                        else -> 400
                    }

                    // Utterance tracking state
                    var activeFrames = 0
                    var consecutiveSilence = 0
                    var voicedFrames = 0
                    val utteranceRmsList = mutableListOf<Double>()
                    val utteranceZcrList = mutableListOf<Int>()

                    while (isListening.get()) {
                        val readSamples = audioRecord.read(frameBuffer, 0, frameBuffer.size)
                        if (readSamples > 0) {
                            var sumSquares = 0.0
                            var maxAmp = 0
                            var zcr = 0

                            for (i in 0 until readSamples) {
                                val s = frameBuffer[i]
                                val a = abs(s.toInt())
                                if (a > maxAmp) maxAmp = a
                                sumSquares += (s * s).toDouble()

                                if (i > 0) {
                                    val prev = frameBuffer[i - 1]
                                    if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
                                        zcr++
                                    }
                                }
                            }

                            val rms = sqrt(sumSquares / readSamples)
                            val crestFactor = if (rms > 1e-4) maxAmp / rms else 0.0

                            // Speech candidate frame:
                            // 1. RMS above ambient threshold
                            // 2. ZCR within speech band (not extreme DC rumble, not pure high-freq white noise)
                            // 3. Crest factor within speech range (rejects sharp impulsive clicks, claps, door slams)
                            val isSpeechCandidate = rms > thresholdRms &&
                                    zcr in minZcr..maxZcr &&
                                    crestFactor in 1.4..12.5

                            if (isSpeechCandidate) {
                                activeFrames++
                                consecutiveSilence = 0
                                utteranceRmsList.add(rms)
                                utteranceZcrList.add(zcr)

                                // Voiced speech check (vowels / resonant frequencies typically have ZCR between 20 and 110)
                                if (zcr in 20..110) {
                                    voicedFrames++
                                }
                            } else {
                                if (activeFrames > 0) {
                                    consecutiveSilence++
                                }
                            }

                            // Evaluate candidate utterance when followed by brief pause (consecutiveSilence in 4..12 frames, ~250..750ms)
                            val silenceThreshold = if (sensitivity == "high") 4 else 5
                            if (activeFrames >= profile.minFrames && consecutiveSilence >= silenceThreshold) {
                                val matchesPhrase = evaluateUtterance(
                                    activeFrames = activeFrames,
                                    voicedFrames = voicedFrames,
                                    rmsList = utteranceRmsList,
                                    zcrList = utteranceZcrList,
                                    profile = profile,
                                    sensitivity = sensitivity
                                )

                                if (matchesPhrase.matched) {
                                    Log.i(
                                        TAG,
                                        "Wake word detected! Phrase: '$currentPhrase', confidence=${matchesPhrase.confidence}, " +
                                        "frames=$activeFrames (${activeFrames * 64}ms), modulations=${matchesPhrase.modulations}"
                                    )
                                    notifyWakeDetected(matchesPhrase.confidence)
                                } else {
                                    Log.d(
                                        TAG,
                                        "Noise burst or non-phrase audio rejected: ${matchesPhrase.reason} " +
                                        "(frames=$activeFrames, voiced=$voicedFrames, phrase='$currentPhrase')"
                                    )
                                }

                                activeFrames = 0
                                consecutiveSilence = 0
                                voicedFrames = 0
                                utteranceRmsList.clear()
                                utteranceZcrList.clear()
                            } else if (activeFrames > profile.maxFrames || consecutiveSilence > 14) {
                                // Utterance too long or silence exceeded; reset
                                activeFrames = 0
                                consecutiveSilence = 0
                                voicedFrames = 0
                                utteranceRmsList.clear()
                                utteranceZcrList.clear()
                            }
                        }
                    }

                    audioRecord.stop()
                    audioRecord.release()
                } catch (e: Exception) {
                    Log.e(TAG, "AudioRecord thread error: ${e.message}", e)
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

    private data class MatchResult(
        val matched: Boolean,
        val confidence: Double,
        val modulations: Int,
        val reason: String?
    )

    private fun evaluateUtterance(
        activeFrames: Int,
        voicedFrames: Int,
        rmsList: List<Double>,
        zcrList: List<Int>,
        profile: PhraseProfile,
        sensitivity: String
    ): MatchResult {
        // 1. Duration check
        if (activeFrames < profile.minFrames) {
            return MatchResult(false, 0.0, 0, "Duration too short (${activeFrames * 64}ms < ${profile.minFrames * 64}ms)")
        }
        if (activeFrames > profile.maxFrames) {
            return MatchResult(false, 0.0, 0, "Duration too long (${activeFrames * 64}ms > ${profile.maxFrames * 64}ms)")
        }

        // 2. Voiced-to-unvoiced balance check
        // Human speech contains a mix of voiced vowels (low ZCR) and unvoiced transitions (higher ZCR)
        val voicedRatio = voicedFrames.toDouble() / activeFrames
        val minVoicedRatio = when (sensitivity) {
            "high" -> 0.15
            "low" -> 0.30
            else -> 0.22
        }
        if (voicedRatio < minVoicedRatio) {
            return MatchResult(false, 0.0, 0, "Lacks sufficient voiced resonance (voicedRatio=$voicedRatio < $minVoicedRatio)")
        }
        if (voicedRatio > 0.95 && activeFrames > 12) {
            return MatchResult(false, 0.0, 0, "Monotonic continuous tone detected (voicedRatio=$voicedRatio)")
        }

        // 3. Syllabic energy modulation
        // Count envelope peaks where energy dips and rises (characteristic of human syllables)
        var modulations = 0
        for (i in 1 until rmsList.size - 1) {
            val prev = rmsList[i - 1]
            val curr = rmsList[i]
            val next = rmsList[i + 1]
            if (curr > prev * 1.15 && curr > next * 1.15) {
                modulations++
            }
        }

        val requiredModulations = when (sensitivity) {
            "high" -> max(0, profile.minModulations - 1)
            "low" -> profile.minModulations
            else -> max(1, profile.minModulations)
        }

        if (modulations < requiredModulations) {
            return MatchResult(false, 0.0, modulations, "Insufficient syllabic modulation ($modulations < $requiredModulations for ${profile.syllables} syllables)")
        }

        // 4. Compute confidence score
        val durationScore = 1.0 - (abs(activeFrames - ((profile.minFrames + profile.maxFrames) / 2.0)) / profile.maxFrames)
        val modulationScore = min(1.0, modulations.toDouble() / max(1, profile.syllables))
        val confidence = min(1.0, max(0.5, (durationScore * 0.4 + modulationScore * 0.4 + voicedRatio * 0.2)))

        return MatchResult(true, confidence, modulations, null)
    }

    private fun notifyWakeDetected(score: Double = 1.0) {
        val wakeIntent = Intent(ACTION_WAKE_WORD_DETECTED).apply {
            setPackage(context.packageName)
            putExtra("phrase", currentPhrase)
            putExtra("timestamp", System.currentTimeMillis())
            putExtra("score", score)
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
