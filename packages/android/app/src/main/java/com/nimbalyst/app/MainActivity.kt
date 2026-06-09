package com.nimbalyst.app

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.nimbalyst.app.analytics.AnalyticsManager
import com.nimbalyst.app.auth.AuthCallbackParseResult
import com.nimbalyst.app.ui.NimbalystAndroidApp
import com.nimbalyst.app.ui.theme.NimbalystAndroidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)

        setContent {
            NimbalystAndroidTheme {
                NimbalystAndroidApp()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val deepLink = intent?.data ?: return
        val app = applicationContext as NimbalystApplication
        val message = when (deepLink.host) {
            "pair" -> {
                val pairingData = com.nimbalyst.app.pairing.QRPairingData.parse(deepLink.toString())
                if (pairingData == null) {
                    "Invalid pairing link."
                } else {
                    AnalyticsManager.setDistinctIdFromPairing(pairingData.analyticsId)
                    val existing = app.pairingStore.state.value.credentials
                    app.pairingStore.savePairing(
                        com.nimbalyst.app.pairing.PairingCredentials(
                            serverUrl = pairingData.serverUrl,
                            encryptionSeed = pairingData.seed,
                            pairedUserId = pairingData.userId,
                            authJwt = pairingData.authSessionJwt ?: existing?.authJwt,
                            authUserId = pairingData.authUserId ?: existing?.authUserId,
                            orgId = pairingData.authOrgId ?: existing?.orgId,
                            personalUserId = pairingData.personalUserId,
                            personalOrgId = pairingData.personalOrgId,
                            sessionToken = pairingData.authSessionToken ?: existing?.sessionToken,
                            authEmail = pairingData.authEmail ?: existing?.authEmail,
                            authExpiresAt = existing?.authExpiresAt
                        )
                    )
                    if (pairingData.authSessionJwt != null) {
                        app.syncManager.connectIfConfigured()
                    }
                    if (pairingData.authSessionJwt != null) "Paired and authenticated." else "Pairing payload imported."
                }
            }

            "auth" -> when (
                val result = com.nimbalyst.app.auth.AuthCallbackParser.parse(
                    deepLink = deepLink.toString(),
                    pairedUserId = app.pairingStore.state.value.credentials?.pairedUserId
                )
            ) {
                is AuthCallbackParseResult.Success -> {
                    app.pairingStore.saveAuthSession(result.data)
                    result.data.email?.let { AnalyticsManager.setEmail(it) }
                    AnalyticsManager.capture("mobile_login_completed")
                    app.syncManager.connectIfConfigured()
                    "Authentication updated for ${result.data.email ?: "paired account"}."
                }

                is AuthCallbackParseResult.Failure -> result.reason
            }

            else -> null
        }

        message?.let {
            Toast.makeText(this, it, Toast.LENGTH_LONG).show()
        }
    }
}
