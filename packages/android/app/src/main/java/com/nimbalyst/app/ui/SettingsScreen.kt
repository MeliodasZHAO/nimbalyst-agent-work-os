package com.nimbalyst.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.nimbalyst.app.NimbalystApplication
import com.nimbalyst.app.R
import com.nimbalyst.app.analytics.AnalyticsManager
import com.nimbalyst.app.data.AgentWorkOSDefaults
import com.nimbalyst.app.data.MobilePermissionPolicy
import com.nimbalyst.app.data.MobilePermissionPolicyMode
import com.nimbalyst.app.pairing.QRPairingData
import com.nimbalyst.app.sync.SyncConnectionState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignOut: () -> Unit,
    onUnpair: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as NimbalystApplication
    val pairingState by app.pairingStore.state.collectAsState()
    val syncState by app.syncManager.state.collectAsState()
    val connectedDevices by app.syncManager.connectedDevices.collectAsState()
    val mobilePolicy by app.repository
        .observeResolvedMobilePermissionPolicy(AgentWorkOSDefaults.SYSTEM_PROJECT_ID)
        .collectAsState(initial = MobilePermissionPolicy.balanced())
    val coroutineScope = rememberCoroutineScope()

    // Dev section: tap version label 7 times to reveal
    var devTapCount by remember { mutableIntStateOf(0) }
    var showDevSection by remember { mutableStateOf(false) }

    // Dev section state
    var showQrScanner by remember { mutableStateOf(false) }
    var qrPayload by remember { mutableStateOf("") }
    var devMessage by remember { mutableStateOf<String?>(null) }

    val msgDevQrInvalid = stringResource(R.string.dev_qr_invalid)
    val msgDevImported = stringResource(R.string.dev_imported)
    val msgDevPairInvalid = stringResource(R.string.pairing_qr_invalid)
    val msgDevScanned = stringResource(R.string.dev_scanned)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        TopAppBar(
            title = { Text(stringResource(R.string.settings_title)) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                }
            }
        )

        // Account section
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_account),
                    style = MaterialTheme.typography.titleMedium
                )

                pairingState.credentials?.let { credentials ->
                    if (!credentials.authEmail.isNullOrBlank()) {
                        Text(
                            text = credentials.authEmail!!,
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                    Text(
                        text = stringResource(R.string.settings_server, credentials.serverUrl),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = stringResource(R.string.settings_sync, syncStatusText(syncState)),
                    style = MaterialTheme.typography.bodyMedium
                )
                syncState.lastError?.let { error ->
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }

        // Connected devices section
        if (connectedDevices.isNotEmpty()) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = stringResource(R.string.settings_connected_devices),
                        style = MaterialTheme.typography.titleMedium
                    )
                    connectedDevices.forEach { device ->
                        Text(
                            text = stringResource(R.string.settings_device_entry, device.name, device.platform),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }

        // Agent Work OS mobile permissions
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_agent_work_os),
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = stringResource(R.string.settings_agent_work_os_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MobilePermissionPolicyMode.entries.forEach { mode ->
                        val selected = mobilePolicy.mode == mode
                        if (selected) {
                            Button(
                                onClick = {},
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(modeLabel(mode))
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    val nextPolicy = mobilePolicy.withModePreset(mode)
                                    coroutineScope.launch {
                                        app.repository.saveMobilePermissionPolicy(
                                            AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                            nextPolicy
                                        )
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(modeLabel(mode))
                            }
                        }
                    }
                }

                PermissionSwitchRow(
                    title = stringResource(R.string.perm_plan_title),
                    description = stringResource(R.string.perm_plan_desc),
                    checked = mobilePolicy.allowPlanApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowPlanApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_tool_title),
                    description = stringResource(R.string.perm_tool_desc),
                    checked = mobilePolicy.allowToolPermissionApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowToolPermissionApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_commit_title),
                    description = stringResource(R.string.perm_commit_desc),
                    checked = mobilePolicy.allowCommitApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowCommitApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_database_title),
                    description = stringResource(R.string.perm_database_desc),
                    checked = mobilePolicy.allowDatabaseRiskApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowDatabaseRiskApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_security_title),
                    description = stringResource(R.string.perm_security_desc),
                    checked = mobilePolicy.allowSecurityRiskApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowSecurityRiskApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_destructive_title),
                    description = stringResource(R.string.perm_destructive_desc),
                    checked = mobilePolicy.allowDestructiveRiskApproval,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    allowDestructiveRiskApproval = checked
                                )
                            )
                        }
                    }
                )
                PermissionSwitchRow(
                    title = stringResource(R.string.perm_shipped_title),
                    description = stringResource(R.string.perm_shipped_desc),
                    checked = mobilePolicy.requireDesktopForShipped,
                    enabled = mobilePolicy.mode == MobilePermissionPolicyMode.Custom,
                    onCheckedChange = { checked ->
                        coroutineScope.launch {
                            app.repository.saveMobilePermissionPolicy(
                                AgentWorkOSDefaults.SYSTEM_PROJECT_ID,
                                mobilePolicy.copy(
                                    mode = MobilePermissionPolicyMode.Custom,
                                    requireDesktopForShipped = checked
                                )
                            )
                        }
                    }
                )

                if (mobilePolicy.mode != MobilePermissionPolicyMode.Custom) {
                    Text(
                        text = stringResource(R.string.perm_custom_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Analytics section
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_analytics),
                    style = MaterialTheme.typography.titleMedium
                )
                var analyticsEnabled by remember { mutableStateOf(AnalyticsManager.isEnabled) }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.settings_analytics_toggle),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = stringResource(R.string.settings_analytics_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = analyticsEnabled,
                        onCheckedChange = { enabled ->
                            analyticsEnabled = enabled
                            if (enabled) AnalyticsManager.optIn() else AnalyticsManager.optOut()
                        }
                    )
                }
            }
        }

        // Sign out / Unpair section
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onSignOut,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.settings_sign_out))
                }

                Button(
                    onClick = onUnpair,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text(stringResource(R.string.settings_unpair))
                }
            }
        }

        // Version label (tap to reveal dev section)
        val packageInfo = remember {
            runCatching {
                context.packageManager.getPackageInfo(context.packageName, 0)
            }.getOrNull()
        }
        Text(
            text = stringResource(R.string.settings_version, packageInfo?.versionName ?: "dev"),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(16.dp)
                .clickable {
                    devTapCount++
                    if (devTapCount >= 7) {
                        showDevSection = true
                    }
                }
        )

        // Hidden dev/debug section
        if (showDevSection) {
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = stringResource(R.string.dev_title),
                        style = MaterialTheme.typography.titleMedium
                    )

                    OutlinedButton(
                        onClick = { app.syncManager.requestFullSync() },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.dev_force_sync))
                    }

                    OutlinedTextField(
                        value = qrPayload,
                        onValueChange = { qrPayload = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.dev_qr_payload_label)) },
                        minLines = 3
                    )
                    OutlinedButton(
                        onClick = {
                            val parsed = QRPairingData.parse(qrPayload)
                            if (parsed == null) {
                                devMessage = msgDevQrInvalid
                            } else {
                                AnalyticsManager.setDistinctIdFromPairing(parsed.analyticsId)
                                val existing = pairingState.credentials
                                if (existing != null) {
                                    app.pairingStore.savePairing(
                                        existing.copy(
                                            serverUrl = parsed.serverUrl,
                                            encryptionSeed = parsed.seed,
                                            pairedUserId = parsed.userId,
                                            personalOrgId = parsed.personalOrgId,
                                            personalUserId = parsed.personalUserId
                                        )
                                    )
                                }
                                devMessage = msgDevImported
                            }
                        },
                        enabled = qrPayload.isNotBlank(),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.dev_import_payload))
                    }
                    OutlinedButton(
                        onClick = { showQrScanner = !showQrScanner },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (showQrScanner) stringResource(R.string.pairing_scan_hide) else stringResource(R.string.pairing_scan_show))
                    }

                    if (showQrScanner) {
                        PairingQrScanner(
                            onScanned = { rawValue ->
                                val parsed = QRPairingData.parse(rawValue)
                                if (parsed == null) {
                                    devMessage = msgDevPairInvalid
                                } else {
                                    AnalyticsManager.setDistinctIdFromPairing(parsed.analyticsId)
                                    devMessage = msgDevScanned
                                    showQrScanner = false
                                }
                            },
                            onCancel = { showQrScanner = false }
                        )
                    }

                    devMessage?.let { msg ->
                        Text(
                            text = msg,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun PermissionSwitchRow(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange
        )
    }
}

@Composable
private fun modeLabel(mode: MobilePermissionPolicyMode): String = when (mode) {
    MobilePermissionPolicyMode.Strict -> stringResource(R.string.perm_mode_strict)
    MobilePermissionPolicyMode.Balanced -> stringResource(R.string.perm_mode_balanced)
    MobilePermissionPolicyMode.Flexible -> stringResource(R.string.perm_mode_flexible)
    MobilePermissionPolicyMode.Custom -> stringResource(R.string.perm_mode_custom)
}

@Composable
private fun syncStatusText(state: SyncConnectionState): String = when {
    state.isConnecting -> stringResource(R.string.sync_status_connecting)
    state.sessionConnected -> stringResource(R.string.sync_status_session)
    state.indexConnected -> stringResource(R.string.sync_status_index)
    state.lastError != null -> stringResource(R.string.sync_status_error)
    else -> stringResource(R.string.sync_status_disconnected)
}
