package com.handsfreeai.assistant

import android.content.Context
import android.content.ContextWrapper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import kotlin.math.PI
import kotlin.math.sin

class SpeakerVerificationManagerTest {

    private lateinit var manager: SpeakerVerificationManager
    private lateinit var fakeKeystore: FakeKeystoreManager

    class TestContext : ContextWrapper(null) {
        override fun getPackageName(): String = "com.handsfreeai"
        override fun getFilesDir(): java.io.File = java.io.File(System.getProperty("java.io.tmpdir") ?: ".")
    }

    class FakeKeystoreManager(context: Context) : KeystoreManager(context) {
        var profile: FloatArray? = null

        override fun isProfileEnrolled(): Boolean = profile != null

        override fun saveVoiceProfile(embedding: FloatArray): Boolean {
            profile = embedding.clone()
            return true
        }

        override fun loadVoiceProfile(): FloatArray? = profile

        override fun deleteVoiceProfile(): Boolean {
            profile = null
            return true
        }
    }

    @Before
    fun setUp() {
        val mockContext = TestContext()
        fakeKeystore = FakeKeystoreManager(mockContext)
        manager = SpeakerVerificationManager(mockContext, fakeKeystore)
    }

    private fun generateSyntheticVoice(
        durationSec: Double = 2.0,
        sampleRate: Int = 16000,
        f0: Double = 130.0,
        harmonics: List<Double> = listOf(1.0, 0.6, 0.4, 0.2, 0.1),
        leadingSilenceSec: Double = 0.15
    ): FloatArray {
        val totalSamples = (durationSec * sampleRate).toInt()
        val silenceSamples = (leadingSilenceSec * sampleRate).toInt().coerceAtMost(totalSamples / 4)
        val samples = FloatArray(totalSamples)

        for (i in silenceSamples until totalSamples) {
            val t = (i - silenceSamples).toDouble() / sampleRate
            // Syllabic envelope modulation (~3.5 Hz)
            val envelope = 0.5 + 0.5 * sin(2.0 * PI * 3.5 * t)
            var sampleVal = 0.0

            for ((hIdx, weight) in harmonics.withIndex()) {
                val freq = f0 * (hIdx + 1)
                sampleVal += weight * sin(2.0 * PI * freq * t)
            }

            samples[i] = (sampleVal * 0.25 * envelope).toFloat().coerceIn(-0.95f, 0.95f)
        }
        return samples
    }

    private fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Double {
        var dot = 0.0
        for (i in v1.indices) {
            dot += v1[i] * v2[i]
        }
        return dot
    }

    @Test
    fun testSameSpeakerHighSimilarityDistinctSpeakerLowSimilarity() {
        // Speaker A: low pitch (130 Hz male voice)
        val sampleA1 = generateSyntheticVoice(durationSec = 2.0, f0 = 130.0)
        val sampleA2 = generateSyntheticVoice(durationSec = 2.0, f0 = 132.0)

        // Speaker B: high pitch (240 Hz female voice)
        val sampleB1 = generateSyntheticVoice(
            durationSec = 2.0,
            f0 = 240.0,
            harmonics = listOf(1.0, 0.3, 0.5, 0.1)
        )

        val embA1 = manager.extractEmbedding(sampleA1)
        val embA2 = manager.extractEmbedding(sampleA2)
        val embB1 = manager.extractEmbedding(sampleB1)

        assertEquals(192, embA1.size)
        assertEquals(192, embA2.size)
        assertEquals(192, embB1.size)

        val sameSpeakerSim = cosineSimilarity(embA1, embA2)
        val distinctSpeakerSim = cosineSimilarity(embA1, embB1)

        // Same speaker timbre should produce substantially higher cosine similarity
        assertTrue("Same speaker similarity ($sameSpeakerSim) should be > 0.80", sameSpeakerSim > 0.80)
        assertTrue(
            "Distinct speaker similarity ($distinctSpeakerSim) should be lower than same speaker ($sameSpeakerSim)",
            distinctSpeakerSim < sameSpeakerSim
        )
    }

    @Test
    fun testQualityChecksShortDuration() {
        // 0.5 seconds @ 16 kHz = 8000 samples (under 1.0s minimum)
        val shortSample = generateSyntheticVoice(durationSec = 0.5)
        val quality = manager.analyzeQuality(shortSample)

        assertFalse("Sample under 1.0s must be rejected", quality.valid)
        assertNotNull(quality.reason)
        assertTrue(quality.reason!!.contains("short", ignoreCase = true))
    }

    @Test
    fun testQualityChecksClippingDetection() {
        val clippedSample = FloatArray(32000) { i ->
            // Exceeds 2% clipped threshold
            if (i % 20 == 0) 1.0f else 0.2f
        }
        val quality = manager.analyzeQuality(clippedSample)

        assertFalse("Severely clipped audio must be rejected", quality.valid)
        assertTrue("Clipping flag should be true", quality.hasClipping)
    }

    @Test
    fun testQualityChecksValidAudio() {
        val validSample = generateSyntheticVoice(durationSec = 2.5)
        val quality = manager.analyzeQuality(validSample)

        assertTrue("Clean synthetic voice sample should pass quality checks", quality.valid)
        assertFalse("Clean sample must not have clipping", quality.hasClipping)
    }

    @Test
    fun testCompressedContainerRejectionWebM() {
        // WebM / Matroska EBML signature: 0x1A 0x45 0xDF 0xA3
        val webmBytes = byteArrayOf(0x1A.toByte(), 0x45.toByte(), 0xDF.toByte(), 0xA3.toByte(), 0x01, 0x00, 0x00, 0x00)
        val base64WebM = Base64.getEncoder().encodeToString(webmBytes)

        var caught = false
        try {
            manager.decodePcmBase64(base64WebM)
        } catch (e: IllegalArgumentException) {
            caught = true
            assertTrue(e.message!!.contains("WebM", ignoreCase = true))
        }
        assertTrue("WebM compressed container should throw IllegalArgumentException", caught)
    }

    @Test
    fun testCompressedContainerRejectionMP4() {
        // MP4 / M4A signature: offset 4 contains "ftyp"
        val mp4Bytes = byteArrayOf(0x00, 0x00, 0x00, 0x20, 'f'.code.toByte(), 't'.code.toByte(), 'y'.code.toByte(), 'p'.code.toByte())
        val base64Mp4 = Base64.getEncoder().encodeToString(mp4Bytes)

        var caught = false
        try {
            manager.decodePcmBase64(base64Mp4)
        } catch (e: IllegalArgumentException) {
            caught = true
            assertTrue(e.message!!.contains("MP4", ignoreCase = true))
        }
        assertTrue("MP4 compressed container should throw IllegalArgumentException", caught)
    }

    @Test
    fun testRawPcmDecoding() {
        val numShorts = 16000
        val pcmBytes = ByteArray(numShorts * 2)
        val buffer = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)

        for (i in 0 until numShorts) {
            buffer.putShort((10000).toShort())
        }

        val base64Raw = Base64.getEncoder().encodeToString(pcmBytes)
        val decodedFloats = manager.decodePcmBase64(base64Raw)

        assertEquals(numShorts, decodedFloats.size)
        assertEquals(10000.0f / 32768.0f, decodedFloats[0], 0.001f)
    }

    @Test
    fun testWavPcmExtraction() {
        // Construct a valid uncompressed 16-bit 16kHz mono WAV container
        val numSamples = 1600
        val pcmDataBytes = ByteArray(numSamples * 2)
        val pcmBuffer = ByteBuffer.wrap(pcmDataBytes).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until numSamples) {
            pcmBuffer.putShort(5000.toShort())
        }

        val headerSize = 44
        val totalSize = headerSize + pcmDataBytes.size
        val wavBytes = ByteArray(totalSize)
        val wavBuffer = ByteBuffer.wrap(wavBytes).order(ByteOrder.LITTLE_ENDIAN)

        // RIFF header
        wavBuffer.put("RIFF".toByteArray(Charsets.US_ASCII))
        wavBuffer.putInt(totalSize - 8)
        wavBuffer.put("WAVE".toByteArray(Charsets.US_ASCII))

        // fmt subchunk
        wavBuffer.put("fmt ".toByteArray(Charsets.US_ASCII))
        wavBuffer.putInt(16) // Subchunk1Size for PCM
        wavBuffer.putShort(1) // AudioFormat (1 = PCM)
        wavBuffer.putShort(1) // NumChannels (1 = mono)
        wavBuffer.putInt(16000) // SampleRate
        wavBuffer.putInt(32000) // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        wavBuffer.putShort(2) // BlockAlign
        wavBuffer.putShort(16) // BitsPerSample

        // data subchunk
        wavBuffer.put("data".toByteArray(Charsets.US_ASCII))
        wavBuffer.putInt(pcmDataBytes.size)
        wavBuffer.put(pcmDataBytes)

        val base64Wav = Base64.getEncoder().encodeToString(wavBytes)
        val decodedFloats = manager.decodePcmBase64(base64Wav)

        assertEquals(numSamples, decodedFloats.size)
        assertEquals(5000.0f / 32768.0f, decodedFloats[0], 0.001f)
    }

    @Test
    fun testFullEnrollmentAndVerificationFlow() {
        val sample1 = generateSyntheticVoice(durationSec = 2.0, f0 = 140.0)
        val sample2 = generateSyntheticVoice(durationSec = 2.0, f0 = 142.0)
        val intruder = generateSyntheticVoice(
            durationSec = 2.0,
            f0 = 350.0,
            harmonics = listOf(0.2, 0.8, 0.1, 0.9)
        )

        manager.resetEnrollment()
        val add1 = manager.addEnrollmentSample(sample1)
        assertTrue(add1["success"] as Boolean)

        val add2 = manager.addEnrollmentSample(sample2)
        assertTrue(add2["success"] as Boolean)

        val finalizeRes = manager.finalizeEnrollment()
        assertTrue(finalizeRes["success"] as Boolean)
        assertTrue(manager.isEnrolled())

        // Verify owner voice sample
        val verifyOwner = manager.verifySpeaker(sample2, threshold = 0.70)
        assertTrue("Enrolled owner sample should be verified", verifyOwner.verified)
        assertTrue(verifyOwner.score >= 0.70)

        // Verify intruder voice sample
        val verifyIntruder = manager.verifySpeaker(intruder, threshold = 0.90)
        assertFalse("Intruder sample should not be verified under strict threshold", verifyIntruder.verified)
        assertTrue("Owner score (${verifyOwner.score}) should exceed intruder score (${verifyIntruder.score})", verifyOwner.score > verifyIntruder.score)
    }
}
