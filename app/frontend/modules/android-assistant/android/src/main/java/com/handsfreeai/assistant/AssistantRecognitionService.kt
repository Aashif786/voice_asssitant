package com.handsfreeai.assistant

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Android RecognitionService implementation.
 * Required by Android's VoiceInteractionManagerService so the app can be eligible
 * as the system's Default Digital Assistant.
 */
class AssistantRecognitionService : RecognitionService() {

    private var systemRecognizer: SpeechRecognizer? = null

    override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
        try {
            if (systemRecognizer == null) {
                systemRecognizer = SpeechRecognizer.createSpeechRecognizer(applicationContext)
            }

            systemRecognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    listener?.readyForSpeech(params)
                }

                override fun onBeginningOfSpeech() {
                    listener?.beginningOfSpeech()
                }

                override fun onRmsChanged(rmsdB: Float) {
                    listener?.rmsChanged(rmsdB)
                }

                override fun onBufferReceived(buffer: ByteArray?) {
                    listener?.bufferReceived(buffer)
                }

                override fun onEndOfSpeech() {
                    listener?.endOfSpeech()
                }

                override fun onError(error: Int) {
                    listener?.error(error)
                }

                override fun onResults(results: Bundle?) {
                    listener?.results(results)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    listener?.partialResults(partialResults)
                }

                override fun onEvent(eventType: Int, params: Bundle?) {
                    // No-op: Callback does not declare onEvent
                }
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            }
            systemRecognizer?.startListening(intent)
        } catch (e: Exception) {
            listener?.error(SpeechRecognizer.ERROR_CLIENT)
        }
    }

    override fun onStopListening(listener: Callback?) {
        try {
            systemRecognizer?.stopListening()
        } catch (e: Exception) {
            /* ignore */
        }
    }

    override fun onCancel(listener: Callback?) {
        try {
            systemRecognizer?.cancel()
        } catch (e: Exception) {
            /* ignore */
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            systemRecognizer?.destroy()
            systemRecognizer = null
        } catch (e: Exception) {
            /* ignore */
        }
    }
}
