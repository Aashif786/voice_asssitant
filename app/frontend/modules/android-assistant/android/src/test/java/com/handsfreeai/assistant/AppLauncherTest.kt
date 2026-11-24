package com.handsfreeai.assistant

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.provider.Settings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AppLauncherTest {

    private lateinit var appLauncher: AppLauncher
    private var lastStartedIntent: Intent? = null

    class TestContext(private val onStartActivity: (Intent?) -> Unit) : ContextWrapper(null) {
        override fun getPackageName(): String = "com.handsfreeai"
        override fun startActivity(intent: Intent?) {
            onStartActivity(intent)
        }
    }

    @Before
    fun setUp() {
        val testContext = TestContext { intent ->
            lastStartedIntent = intent
        }
        appLauncher = AppLauncher(testContext)
    }

    @Test
    fun testSettingsActionMappings() {
        // Both "app" and "apps" map to application details settings
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, appLauncher.getSettingsAction("app"))
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, appLauncher.getSettingsAction("apps"))
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, appLauncher.getSettingsAction("details"))
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, appLauncher.getSettingsAction("applications"))

        // System settings
        assertEquals(Settings.ACTION_WIFI_SETTINGS, appLauncher.getSettingsAction("wifi"))
        assertEquals(Settings.ACTION_WIFI_SETTINGS, appLauncher.getSettingsAction("wi-fi"))
        assertEquals(Settings.ACTION_BLUETOOTH_SETTINGS, appLauncher.getSettingsAction("bluetooth"))
        assertEquals(Settings.ACTION_BATTERY_SAVER_SETTINGS, appLauncher.getSettingsAction("battery"))
        assertEquals(Settings.ACTION_BATTERY_SAVER_SETTINGS, appLauncher.getSettingsAction("power"))
        assertEquals(Settings.ACTION_DISPLAY_SETTINGS, appLauncher.getSettingsAction("display"))
        assertEquals(Settings.ACTION_DISPLAY_SETTINGS, appLauncher.getSettingsAction("brightness"))
        assertEquals(Settings.ACTION_SOUND_SETTINGS, appLauncher.getSettingsAction("sound"))
        assertEquals(Settings.ACTION_SOUND_SETTINGS, appLauncher.getSettingsAction("volume"))
        assertEquals(Settings.ACTION_SOUND_SETTINGS, appLauncher.getSettingsAction("audio"))
        assertEquals(Settings.ACTION_LOCATION_SOURCE_SETTINGS, appLauncher.getSettingsAction("location"))
        assertEquals(Settings.ACTION_SETTINGS, appLauncher.getSettingsAction("unknown"))
    }

    @Test
    fun testOpenSettingsExecutesWithoutError() {
        val okApp = appLauncher.openSettings("app")
        assertTrue(okApp)

        val okApps = appLauncher.openSettings("apps")
        assertTrue(okApps)

        val okBattery = appLauncher.openSettings("battery")
        assertTrue(okBattery)
    }
}
