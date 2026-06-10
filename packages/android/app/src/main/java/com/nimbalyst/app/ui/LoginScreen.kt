package com.nimbalyst.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.browser.customtabs.CustomTabsIntent
import android.content.Context
import android.net.Uri
import com.nimbalyst.app.R
import com.nimbalyst.app.analytics.AnalyticsManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun LoginScreen(
    serverUrl: String,
    pairedEmail: String?,
    onUnpair: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var magicLinkSent by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val baseUrl = serverUrl
        .replace("wss://", "https://")
        .replace("ws://", "http://")
        .trimEnd('/')

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.AccountCircle,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = stringResource(R.string.login_title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (!pairedEmail.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.login_subtitle_paired, pairedEmail),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        } else {
            Text(
                text = stringResource(R.string.login_subtitle_unpaired),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        if (magicLinkSent && !pairedEmail.isNullOrBlank()) {
            // Magic link sent state
            Text(
                text = stringResource(R.string.login_check_email_title),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.login_check_email_body, pairedEmail),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.login_chrome_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(
                onClick = {
                    magicLinkSent = false
                    errorMessage = null
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.login_resend))
            }
        } else {
            // Sign-in buttons

            // Magic link button (primary when paired email exists — most users need this)
            if (!pairedEmail.isNullOrBlank()) {
                Button(
                    onClick = {
                        isLoading = true
                        errorMessage = null
                        coroutineScope.launch {
                            val result = sendMagicLink(context, baseUrl, pairedEmail)
                            isLoading = false
                            if (result == null) {
                                magicLinkSent = true
                                AnalyticsManager.capture("mobile_magic_link_sent")
                            } else {
                                errorMessage = result
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(stringResource(R.string.login_email_link))
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            // Google OAuth button (secondary when magic link available)
            if (!pairedEmail.isNullOrBlank()) {
                OutlinedButton(
                    onClick = {
                        val loginUrl = "$baseUrl/auth/login/google"
                        AnalyticsManager.capture("mobile_login_started")
                        CustomTabsIntent.Builder()
                            .build()
                            .launchUrl(context, Uri.parse(loginUrl))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading
                ) {
                    Text(stringResource(R.string.login_google))
                }
            } else {
                // No paired email — Google is the only option
                Button(
                    onClick = {
                        val loginUrl = "$baseUrl/auth/login/google"
                        AnalyticsManager.capture("mobile_login_started")
                        CustomTabsIntent.Builder()
                            .build()
                            .launchUrl(context, Uri.parse(loginUrl))
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.login_google))
                }
            }
        }

        // Error message
        if (!errorMessage.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = errorMessage!!,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(48.dp))

        TextButton(onClick = {
            AnalyticsManager.capture("mobile_device_unpairing")
            AnalyticsManager.reset()
            onUnpair()
        }) {
            Text(
                text = stringResource(R.string.login_unpair),
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

private suspend fun sendMagicLink(context: Context, baseUrl: String, email: String): String? {
    return withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/auth/magic-link")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true

            val body = JSONObject().apply {
                put("email", email)
                put("redirect_url", "$baseUrl/auth/callback")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray()) }

            val code = conn.responseCode
            if (code == 200) {
                null
            } else {
                val errorBody = conn.errorStream?.bufferedReader()?.readText() ?: ""
                val errorJson = runCatching { JSONObject(errorBody) }.getOrNull()
                errorJson?.optString("error") ?: context.getString(R.string.login_error_send_failed, code)
            }
        } catch (e: Exception) {
            context.getString(R.string.login_error_network, e.localizedMessage)
        }
    }
}
