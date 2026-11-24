package com.handsfreeai.assistant

import android.Manifest
import android.app.role.RoleManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
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
    private var wakeWordReceiver: BroadcastReceiver? = null

    private fun registerWakeWordReceiver() {
        if (wakeWordReceiver != null) return
        try {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    if (intent?.action == WakeWordDetector.ACTION_WAKE_WORD_DETECTED) {
                        val phrase = intent.getStringExtra("phrase") ?: "Hey Assistant"
                        val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())
                        val score = intent.getDoubleExtra("score", 1.0)
                        Log.d("AndroidAssistantModule", "Emitting onWakeWordDetected to JS: phrase='$phrase', score=$score")
                        this@AndroidAssistantModule.sendEvent(
                            "onWakeWordDetected",
                            mapOf(
                                "phrase" to phrase,
                                "timestamp" to timestamp,
                                "score" to score
                            )
                        )
                    }
                }
            }
            val filter = IntentFilter(WakeWordDetector.ACTION_WAKE_WORD_DETECTED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            }
            wakeWordReceiver = receiver
            Log.d("AndroidAssistantModule", "Wake-word BroadcastReceiver registered successfully.")
        } catch (e: Exception) {
            Log.w("AndroidAssistantModule", "Failed to register wake-word receiver: ${e.message}")
        }
    }

    private fun unregisterWakeWordReceiver() {
        wakeWordReceiver?.let {
            try {
                context.unregisterReceiver(it)
                Log.d("AndroidAssistantModule", "Wake-word BroadcastReceiver unregistered.")
            } catch (e: Exception) {
                // Ignore if already unregistered
            }
            wakeWordReceiver = null
        }
    }

    override fun definition() = ModuleDefinition {
        Name("AndroidAssistant")

        Events(
            "onWakeWordDetected",
            "onSpeechPartialResult",
            "onSpeechFinalResult",
            "onSpeechError"
        )

        OnCreate {
            try {
                registerWakeWordReceiver()
            } catch (e: Exception) {
                // ReactContext might be lazily bound; will register on first start call
            }
        }

        OnDestroy {
            unregisterWakeWordReceiver()
            speechRecognizerManager?.destroy()
            speechRecognizerManager = null
        }

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

        AsyncFunction("requestContactsPermission") { promise: Promise ->
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                promise.resolve(true)
                return@AsyncFunction
            }

            val permissions = appContext.permissions
            if (permissions != null) {
                permissions.askForPermissions(
                    { result ->
                        val resp = result[Manifest.permission.READ_CONTACTS]
                        val isGranted = resp?.status == PermissionsStatus.GRANTED
                        promise.resolve(isGranted)
                    },
                    Manifest.permission.READ_CONTACTS
                )
            } else {
                val activity = appContext.currentActivity
                if (activity == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
                ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.READ_CONTACTS), 103)
                val postGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
                promise.resolve(postGranted)
            }
        }

        AsyncFunction("searchContacts") { query: String ->
            contactsManager.searchContacts(query)
        }

        // 3. Calls
        AsyncFunction("hasDirectCallPermission") {
            callManager.hasDirectCallPermission()
        }

        AsyncFunction("requestCallPermission") { promise: Promise ->
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                promise.resolve(true)
                return@AsyncFunction
            }

            val permissions = appContext.permissions
            if (permissions != null) {
                permissions.askForPermissions(
                    { result ->
                        val resp = result[Manifest.permission.CALL_PHONE]
                        val isGranted = resp?.status == PermissionsStatus.GRANTED
                        promise.resolve(isGranted)
                    },
                    Manifest.permission.CALL_PHONE
                )
            } else {
                val activity = appContext.currentActivity
                if (activity == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
                ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE), 102)
                val postGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
                promise.resolve(postGranted)
            }
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
            registerWakeWordReceiver()
            wakeWordDetector.start(phrase, sensitivity)
        }

        AsyncFunction("stopWakeWord") {
            wakeWordDetector.stop()
        }

        // 8. Foreground Background Service & System Assistant
        // Note: AssistantForegroundService alone owns AudioRecord capture when listening in foreground service
        // to prevent dual mic contention.
        AsyncFunction("startForegroundListening") { phrase: String, sensitivity: String ->
            registerWakeWordReceiver()
            AssistantForegroundService.startListening(context, phrase, sensitivity)
            mapOf("ok" to true, "message" to "Foreground listening service started.")
        }

        AsyncFunction("stopForegroundListening") {
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
