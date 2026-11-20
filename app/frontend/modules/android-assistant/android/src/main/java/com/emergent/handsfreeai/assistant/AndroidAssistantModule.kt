package com.emergent.handsfreeai.assistant

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.speech.SpeechRecognizer
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidAssistantModule : Module() {
    private val context get() = appContext.reactContext ?: throw IllegalStateException("ReactContext is not available")

    private val appLauncher by lazy { AppLauncher(context) }
    private val contactsManager by lazy { ContactsManager(context) }
    private val callManager by lazy { CallManager(context) }
    private val messageDispatcher by lazy { MessageDispatcher(context) }
    private val systemControlManager by lazy { SystemControlManager(context) }
    private val speakerVerificationManager by lazy { SpeakerVerificationManager(context) }
    private val wakeWordDetector by lazy { WakeWordDetector(context) }

    private var speechRecognizerManager: SpeechRecognizerManager? = null

    override fun definition() = ModuleDefinition {
        Name("AndroidAssistant")

        Events(
            "onWakeWordDetected",
            "onSpeechPartialResult",
            "onSpeechFinalResult",
            "onSpeechError"
        )

        // 1. Applications
        AsyncFunction("getInstalledApps") {
            appLauncher.getInstalledApps()
        }

        AsyncFunction("openApp") { packageName: String ->
            appLauncher.openApp(packageName)
        }

        AsyncFunction("openAppByName") { name: String ->
            appLauncher.openAppByName(name)
        }

        AsyncFunction("openSettings") { settingType: String ->
            appLauncher.openSettings(settingType)
        }

        AsyncFunction("navigateHome") {
            appLauncher.navigateHome()
        }

        // 2. Contacts
        AsyncFunction("hasContactsPermission") {
            contactsManager.hasPermission()
        }

        AsyncFunction("requestContactsPermission") {
            val activity = appContext.currentActivity ?: return@AsyncFunction false
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            if (granted) return@AsyncFunction true
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.READ_CONTACTS), 103)
            true
        }

        AsyncFunction("searchContacts") { query: String ->
            contactsManager.searchContacts(query)
        }

        // 3. Calls
        AsyncFunction("hasDirectCallPermission") {
            callManager.hasDirectCallPermission()
        }

        AsyncFunction("requestCallPermission") {
            val activity = appContext.currentActivity ?: return@AsyncFunction false
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            if (granted) return@AsyncFunction true
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE), 102)
            true
        }

        AsyncFunction("dial") { number: String ->
            callManager.dial(number)
        }

        AsyncFunction("call") { number: String, fallbackToDial: Boolean? ->
            callManager.call(number, fallbackToDial ?: false)
        }

        // 4. Messaging
        AsyncFunction("openWhatsApp") { number: String?, message: String ->
            messageDispatcher.openWhatsApp(number, message)
        }

        AsyncFunction("openSms") { number: String?, message: String ->
            messageDispatcher.openSms(number, message)
        }

        // 5. System Controls
        AsyncFunction("setFlashlight") { enabled: Boolean ->
            systemControlManager.setFlashlight(enabled)
        }

        AsyncFunction("toggleFlashlight") {
            systemControlManager.toggleFlashlight()
        }

        AsyncFunction("getBatteryStatus") {
            systemControlManager.getBatteryStatus()
        }

        AsyncFunction("setVolume") { stream: String, percentage: Int ->
            systemControlManager.setVolume(stream, percentage)
        }

        AsyncFunction("getVolume") { stream: String ->
            systemControlManager.getVolume(stream)
        }

        AsyncFunction("setAlarm") { hour: Int, minute: Int, message: String ->
            systemControlManager.setAlarm(hour, minute, message)
        }

        AsyncFunction("setTimer") { seconds: Int, message: String ->
            systemControlManager.setTimer(seconds, message)
        }

        AsyncFunction("getAudioRoutingEnvironment") {
            systemControlManager.getAudioRoutingEnvironment()
        }

        // 6. Voice Security & Biometrics
        AsyncFunction("isVoiceEnrolled") {
            speakerVerificationManager.isEnrolled()
        }

        AsyncFunction("deleteVoiceProfile") {
            speakerVerificationManager.keystoreManager.deleteVoiceProfile()
        }

        AsyncFunction("startVoiceEnrollment") {
            speakerVerificationManager.resetEnrollment()
            mapOf("ok" to true, "message" to "Voice enrollment session started.")
        }

        AsyncFunction("addEnrollmentSample") { audioBase64: String ->
            val pcm = speakerVerificationManager.decodePcmBase64(audioBase64)
            speakerVerificationManager.addEnrollmentSample(pcm)
        }

        AsyncFunction("finalizeEnrollment") {
            speakerVerificationManager.finalizeEnrollment()
        }

        AsyncFunction("verifySpeaker") { audioBase64: String, threshold: Double, checkAntiSpoof: Boolean ->
            val pcm = speakerVerificationManager.decodePcmBase64(audioBase64)
            val res = speakerVerificationManager.verifySpeaker(pcm, threshold, checkAntiSpoof)
            mapOf(
                "verified" to res.verified,
                "score" to res.score,
                "threshold" to res.threshold,
                "snrDb" to res.snrDb,
                "isSpoofOrReplay" to res.isSpoofOrReplay,
                "message" to res.message
            )
        }

        // 7. Wake Word
        AsyncFunction("getWakeWordStatus") {
            wakeWordDetector.getStatus()
        }

        AsyncFunction("startWakeWord") { phrase: String, sensitivity: String ->
            wakeWordDetector.start(phrase, sensitivity)
        }

        AsyncFunction("stopWakeWord") {
            wakeWordDetector.stop()
        }

        // 8. Foreground Background Service & System Assistant
        AsyncFunction("startForegroundListening") { phrase: String, sensitivity: String ->
            wakeWordDetector.start(phrase, sensitivity)
            AssistantForegroundService.startListening(context, phrase, sensitivity)
            mapOf("ok" to true, "message" to "Foreground listening service started.")
        }

        AsyncFunction("stopForegroundListening") {
            wakeWordDetector.stop()
            AssistantForegroundService.stopListening(context)
            mapOf("ok" to true, "message" to "Foreground listening service stopped.")
        }

        AsyncFunction("isForegroundServiceRunning") {
            AssistantForegroundService.isServiceRunning
        }

        AsyncFunction("isDefaultAssistant") {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val rm = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                    if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
                        return@AsyncFunction rm.isRoleHeld(RoleManager.ROLE_ASSISTANT)
                    }
                }
                val cur = Settings.Secure.getString(context.contentResolver, "voice_interaction_service")
                val myPkg = context.packageName
                cur != null && cur.contains(myPkg)
            } catch (e: Exception) {
                false
            }
        }

        AsyncFunction("requestDefaultAssistantRole") {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val rm = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                    if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
                        val currentActivity = appContext.currentActivity
                        if (currentActivity != null) {
                            val roleIntent = rm.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT)
                            currentActivity.startActivity(roleIntent)
                            return@AsyncFunction mapOf("ok" to true, "launchedRoleDialog" to true)
                        }
                    }
                }
                // Fallback to voice input settings
                val intent = Intent(Settings.ACTION_VOICE_INPUT_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                mapOf("ok" to true, "launchedRoleDialog" to false)
            } catch (e: Exception) {
                mapOf("ok" to false, "error" to (e.message ?: "Could not open settings"))
            }
        }

        AsyncFunction("openDefaultAssistantSettings") {
            val intent = Intent(Settings.ACTION_VOICE_INPUT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
                true
            } catch (e: Exception) {
                val fallbackIntent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    context.startActivity(fallbackIntent)
                    true
                } catch (e2: Exception) {
                    false
                }
            }
        }

        // 9. System Speech Recognition
        AsyncFunction("isSystemSpeechAvailable") {
            SpeechRecognizer.isRecognitionAvailable(context)
        }

        AsyncFunction("startSystemSpeech") { language: String? ->
            if (speechRecognizerManager == null) {
                speechRecognizerManager = SpeechRecognizerManager(
                    context = context,
                    onPartial = { text ->
                        this@AndroidAssistantModule.sendEvent("onSpeechPartialResult", mapOf("text" to text))
                    },
                    onFinal = { text ->
                        this@AndroidAssistantModule.sendEvent("onSpeechFinalResult", mapOf("text" to text))
                    },
                    onErrorCallback = { err ->
                        this@AndroidAssistantModule.sendEvent("onSpeechError", mapOf("error" to err))
                    }
                )
            }
            speechRecognizerManager?.startListening(language ?: "en-US")
            mapOf("ok" to true)
        }

        AsyncFunction("stopSystemSpeech") {
            speechRecognizerManager?.stopListening()
            mapOf("ok" to true)
        }

        AsyncFunction("cancelSystemSpeech") {
            speechRecognizerManager?.cancel()
            mapOf("ok" to true)
        }

        // 10. Notification Listener Service
        AsyncFunction("hasNotificationAccess") {
            AssistantNotificationListener.isAccessGranted(context)
        }

        AsyncFunction("openNotificationAccessSettings") {
            AssistantNotificationListener.openSettings(context)
        }

        AsyncFunction("getRecentNotifications") { limit: Int? ->
            AssistantNotificationListener.getRecent(limit ?: 10)
        }

        AsyncFunction("clearRecentNotifications") {
            AssistantNotificationListener.clear()
            true
        }
    }
}
