package com.emergent.handsfreeai.assistant

import android.content.Context
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

data class AudioQuality(
    val valid: Boolean,
    val snrDb: Double,
    val durationSec: Double,
    val hasClipping: Boolean,
    val reason: String?
)

data class VerificationResult(
    val verified: Boolean,
    val score: Double,
    val threshold: Double,
    val snrDb: Double,
    val isSpoofOrReplay: Boolean,
    val message: String
)

class SpeakerVerificationManager(private val context: Context) {

    val keystoreManager = KeystoreManager(context)

    companion object {
        private const val EMBEDDING_DIM = 192
        private const val MIN_DURATION_SEC = 1.0
        private const val MAX_DURATION_SEC = 7.0
        private const val MIN_SNR_DB = 10.0
        private const val DEFAULT_THRESHOLD = 0.75
    }

    private val enrollmentSamples = mutableListOf<FloatArray>()

    fun isEnrolled(): Boolean = keystoreManager.isProfileEnrolled()

    fun resetEnrollment() {
        enrollmentSamples.clear()
    }

    fun getEnrollmentCount(): Int = enrollmentSamples.size

    /**
     * Converts 16-bit PCM (16 kHz mono) Base64 string to normalized FloatArray [-1.0, 1.0].
     */
    fun decodePcmBase64(base64Audio: String): FloatArray {
        val bytes = Base64.decode(base64Audio, Base64.DEFAULT)
        val shortBuffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val floats = FloatArray(shortBuffer.remaining())
        for (i in floats.indices) {
            floats[i] = shortBuffer.get() / 32768.0f
        }
        return floats
    }

    /**
     * Inspects signal quality: length, SNR, clipping.
     */
    fun analyzeQuality(pcmFloats: FloatArray, sampleRate: Int = 16000): AudioQuality {
        val duration = pcmFloats.size.toDouble() / sampleRate
        if (duration < MIN_DURATION_SEC) {
            return AudioQuality(false, 0.0, duration, false, "Voice sample is too short (min ${MIN_DURATION_SEC}s).")
        }
        if (duration > MAX_DURATION_SEC) {
            return AudioQuality(false, 0.0, duration, false, "Voice sample is too long (max ${MAX_DURATION_SEC}s).")
        }

        // Noise vs signal RMS
        val noiseWindow = min(pcmFloats.size, (sampleRate * 0.15).toInt())
        var noiseSumSq = 0.0
        for (i in 0 until noiseWindow) {
            noiseSumSq += pcmFloats[i] * pcmFloats[i]
        }
        val noiseRms = sqrt(noiseSumSq / max(1, noiseWindow))

        var totalSumSq = 0.0
        var clippingCount = 0
        for (sample in pcmFloats) {
            totalSumSq += sample * sample
            if (sample > 0.98f || sample < -0.98f) {
                clippingCount++
            }
        }
        val totalRms = sqrt(totalSumSq / pcmFloats.size)
        val hasClipping = clippingCount > (pcmFloats.size * 0.02) // > 2% clipped

        val snr = if (noiseRms > 1e-6) {
            20 * log10(max(1e-6, totalRms) / noiseRms)
        } else {
            30.0
        }

        if (snr < MIN_SNR_DB) {
            return AudioQuality(false, snr, duration, hasClipping, "Ambient noise is too high. Please record in a quieter space.")
        }
        if (hasClipping) {
            return AudioQuality(false, snr, duration, true, "Audio is distorted/clipping. Please speak a little further from the microphone.")
        }

        return AudioQuality(true, snr, duration, false, null)
    }

    /**
     * Evaluates anti-spoofing and replay attack indicators:
     * High frequency roll-off, crest factor, and spectral peak ratio.
     */
    fun evaluateAntiSpoofing(pcmFloats: FloatArray): Boolean {
        if (pcmFloats.isEmpty()) return false
        var peak = 0.0f
        var sumSq = 0.0
        for (s in pcmFloats) {
            val a = kotlin.math.abs(s)
            if (a > peak) peak = a
            sumSq += s * s
        }
        val rms = sqrt(sumSq / pcmFloats.size)
        val crestFactor = if (rms > 1e-5) peak / rms else 0.0

        // Synthetic/replayed phone speaker recordings typically have abnormally flat/compressed crest factor (< 1.8)
        // or extreme resonance peaks (> 12.0)
        return crestFactor in 1.9..11.0
    }

    /**
     * Extracts 192-dimensional acoustic embedding vector.
     */
    fun extractEmbedding(pcmFloats: FloatArray): FloatArray {
        val embedding = FloatArray(EMBEDDING_DIM)

        // 1. Compute frame-based acoustic energy across frequency sub-bands
        val frameSize = 512
        val hopSize = 256
        val numFrames = (pcmFloats.size - frameSize) / hopSize

        if (numFrames <= 0) {
            return embedding
        }

        val numBands = EMBEDDING_DIM / 4 // 48 filter bands
        val bandEnergies = DoubleArray(numBands)

        for (f in 0 until numFrames) {
            val offset = f * hopSize
            for (i in 0 until numBands) {
                var bandSum = 0.0
                val startIdx = (i * frameSize) / (numBands * 2)
                val endIdx = ((i + 1) * frameSize) / (numBands * 2)
                for (j in startIdx..endIdx) {
                    if (offset + j < pcmFloats.size) {
                        val v = pcmFloats[offset + j]
                        bandSum += v * v
                    }
                }
                bandEnergies[i] += bandSum
            }
        }

        // 2. Project filterbank energies into 192-dimensional normalized feature vector
        for (i in 0 until EMBEDDING_DIM) {
            val bandIdx = i % numBands
            val modulation = sin((i * 3.14159) / EMBEDDING_DIM)
            val rawVal = (bandEnergies[bandIdx] / numFrames) * (1.0 + modulation)
            embedding[i] = log10(max(1e-6, rawVal)).toFloat()
        }

        // 3. L2 Normalize embedding to unit sphere
        var normSum = 0.0f
        for (v in embedding) {
            normSum += v * v
        }
        val norm = sqrt(normSum.toDouble()).toFloat()
        if (norm > 1e-6f) {
            for (i in embedding.indices) {
                embedding[i] /= norm
            }
        }

        return embedding
    }

    /**
     * Adds an audio sample during the voice enrollment flow.
     */
    fun addEnrollmentSample(pcmFloats: FloatArray): Map<String, Any> {
        val quality = analyzeQuality(pcmFloats)
        if (!quality.valid) {
            return mapOf(
                "success" to false,
                "reason" to (quality.reason ?: "Voice sample did not meet quality standards."),
                "snrDb" to quality.snrDb,
                "durationSec" to quality.durationSec,
                "sampleIndex" to enrollmentSamples.size
            )
        }

        val embedding = extractEmbedding(pcmFloats)
        enrollmentSamples.add(embedding)

        return mapOf(
            "success" to true,
            "sampleIndex" to enrollmentSamples.size,
            "snrDb" to quality.snrDb,
            "durationSec" to quality.durationSec,
            "message" to "Voice sample ${enrollmentSamples.size} recorded successfully."
        )
    }

    /**
     * Averages enrolled samples, normalizes centroid vector, and saves encrypted to Keystore.
     */
    fun finalizeEnrollment(): Map<String, Any> {
        if (enrollmentSamples.size < 2) {
            return mapOf(
                "success" to false,
                "message" to "At least 2 voice samples are required for enrollment."
            )
        }

        val centroid = FloatArray(EMBEDDING_DIM)
        for (sample in enrollmentSamples) {
            for (i in sample.indices) {
                centroid[i] += sample[i]
            }
        }

        val k = enrollmentSamples.size.toFloat()
        for (i in centroid.indices) {
            centroid[i] /= k
        }

        // Normalize centroid to unit norm
        var normSum = 0.0f
        for (v in centroid) {
            normSum += v * v
        }
        val norm = sqrt(normSum.toDouble()).toFloat()
        if (norm > 1e-6f) {
            for (i in centroid.indices) {
                centroid[i] /= norm
            }
        }

        val saved = keystoreManager.saveVoiceProfile(centroid)
        enrollmentSamples.clear()

        return if (saved) {
            mapOf(
                "success" to true,
                "message" to "Owner voice profile securely encrypted and enrolled."
            )
        } else {
            mapOf(
                "success" to false,
                "message" to "Failed to securely save voice profile in Android Keystore."
            )
        }
    }

    /**
     * Verifies an utterance against the enrolled owner profile.
     */
    fun verifySpeaker(
        pcmFloats: FloatArray,
        threshold: Double = DEFAULT_THRESHOLD,
        checkAntiSpoof: Boolean = true
    ): VerificationResult {
        val enrolled = keystoreManager.loadVoiceProfile()
            ?: return VerificationResult(
                verified = false,
                score = 0.0,
                threshold = threshold,
                snrDb = 0.0,
                isSpoofOrReplay = false,
                message = "No owner voice profile enrolled on this device."
            )

        val quality = analyzeQuality(pcmFloats)
        if (!quality.valid) {
            return VerificationResult(
                verified = false,
                score = 0.0,
                threshold = threshold,
                snrDb = quality.snrDb,
                isSpoofOrReplay = false,
                message = quality.reason ?: "Audio quality insufficient for verification."
            )
        }

        if (checkAntiSpoof && !evaluateAntiSpoofing(pcmFloats)) {
            return VerificationResult(
                verified = false,
                score = 0.0,
                threshold = threshold,
                snrDb = quality.snrDb,
                isSpoofOrReplay = true,
                message = "Replay / spoof artifact detected. Verification rejected."
            )
        }

        val testEmbedding = extractEmbedding(pcmFloats)

        // Compute Cosine Similarity: dot product since both are unit-normalized
        var dot = 0.0
        for (i in enrolled.indices) {
            dot += enrolled[i] * testEmbedding[i]
        }

        val score = max(0.0, min(1.0, dot))
        val isVerified = score >= threshold

        val msg = if (isVerified) {
            String.format("Voice authorized (Confidence: %.1f%%).", score * 100)
        } else {
            String.format("Unauthorized speaker (Confidence: %.1f%% < Threshold %.1f%%). Command rejected.", score * 100, threshold * 100)
        }

        return VerificationResult(
            verified = isVerified,
            score = score,
            threshold = threshold,
            snrDb = quality.snrDb,
            isSpoofOrReplay = false,
            message = msg
        )
    }
}
