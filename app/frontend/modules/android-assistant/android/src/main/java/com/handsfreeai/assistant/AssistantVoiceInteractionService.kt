package com.handsfreeai.assistant

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/**
 * Android VoiceInteractionService implementation.
 * Enables the app to be chosen as the default assistant on Android devices.
 */
class AssistantVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
    }

    override fun onShutdown() {
        super.onShutdown()
    }
}

class AssistantVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return AssistantVoiceInteractionSession(this)
    }
}

class AssistantVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
    override fun onHandleAssist(data: Bundle?, structure: AssistStructure?, content: AssistContent?) {
        super.onHandleAssist(data, structure, content)
        // Bring MainActivity to foreground when assistant trigger occurs
        try {
            val pm = context.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(context.packageName)?.apply {
                action = Intent.ACTION_ASSIST
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            if (launchIntent != null) {
                context.startActivity(launchIntent)
            }
        } catch (e: Exception) {
            /* ignore */
        }
    }

    override fun onHandleAssistSecondary(
        data: Bundle?,
        structure: AssistStructure?,
        content: AssistContent?,
        userHandle: Int,
        subActivityIndex: Int
    ) {
        super.onHandleAssistSecondary(data, structure, content, userHandle, subActivityIndex)
    }
}
