package com.nimbalyst.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.nimbalyst.app.R
import com.nimbalyst.app.analytics.AnalyticsManager
import com.nimbalyst.app.pairing.PairingCredentials

@Composable
fun OnboardingScreen(
    onSavePairing: (PairingCredentials) -> Unit
) {
    var showQrScanner by remember { mutableStateOf(false) }
    var editorMessage by remember { mutableStateOf<String?>(null) }
    var formState by remember {
        mutableStateOf(PairingFormState(serverUrl = "https://sync.nimbalyst.local"))
    }
    val msgQrInvalid = stringResource(R.string.pairing_qr_invalid)
    val msgQrScanned = stringResource(R.string.pairing_qr_scanned)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = stringResource(R.string.pairing_onboarding_title),
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = stringResource(R.string.pairing_onboarding_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Button(
            onClick = { showQrScanner = !showQrScanner }
        ) {
            Text(if (showQrScanner) stringResource(R.string.pairing_scan_hide) else stringResource(R.string.pairing_scan_show))
        }

        if (showQrScanner) {
            PairingQrScanner(
                onScanned = { rawValue ->
                    val parsed = com.nimbalyst.app.pairing.QRPairingData.parse(rawValue)
                    if (parsed == null) {
                        editorMessage = msgQrInvalid
                    } else {
                        AnalyticsManager.setDistinctIdFromPairing(parsed.analyticsId)
                        formState = formState.copy(
                            serverUrl = parsed.serverUrl,
                            encryptionSeed = parsed.seed,
                            pairedUserId = parsed.userId,
                            orgId = parsed.personalOrgId.orEmpty(),
                            personalUserId = parsed.personalUserId.orEmpty()
                        )
                        editorMessage = msgQrScanned
                        showQrScanner = false
                    }
                },
                onCancel = { showQrScanner = false }
            )
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            PairingCredentialsForm(
                state = formState,
                onStateChange = { formState = it },
                onSave = {
                    onSavePairing(formState.toCredentials())
                    AnalyticsManager.capture("mobile_pairing_completed")
                },
                modifier = Modifier.padding(16.dp),
                message = editorMessage
            )
        }
    }
}

internal fun PairingFormState.toCredentials() = PairingCredentials(
    serverUrl = serverUrl.trim(),
    encryptionSeed = encryptionSeed.trim(),
    pairedUserId = pairedUserId.trim().ifBlank { null },
    authJwt = authJwt.trim().ifBlank { null },
    authUserId = authUserId.trim().ifBlank { null },
    orgId = authOrgId.trim().ifBlank { null },
    personalUserId = personalUserId.trim().ifBlank { null },
    personalOrgId = orgId.trim().ifBlank { null }
)
