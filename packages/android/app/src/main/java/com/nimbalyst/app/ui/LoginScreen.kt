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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.browser.customtabs.CustomTabsIntent
import android.net.Uri
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
            text = "Sign In",
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (!pairedEmail.isNullOrBlank()) {
            Text(
                text = buildAnnotatedString {
                    append("Sign in as ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                        append(pairedEmail)
                    }
                    append(" to sync with your desktop.")
                },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        } else {
            Text(
                text = "Sign in to sync sessions with your desktop.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        if (magicLinkSent && !pairedEmail.isNullOrBlank()) {
            // Magic link sent state
            Text(
                text = "Check your email",
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = buildAnnotatedString {
                    append("We sent a sign-in link to ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                        append(pairedEmail)
                    }
                    append(". Tap the link in your email to continue.")
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(
                onClick = {
                    magicLinkSent = false
                    errorMessage = null
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Resend or try another method")
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
                            val result = sendMagicLink(baseUrl, pairedEmail)
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
                        Text("Sign in with email link")
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
                    Text("Sign in with Google")
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
                    Text("Sign in with Google")
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
                text = "Unpair Device",
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

private suspend fun sendMagicLink(baseUrl: String, email: String): String? {
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
                errorJson?.optString("error") ?: "Failed to send magic link (HTTP $code)"
            }
        } catch (e: Exception) {
            "Network error: ${e.localizedMessage}"
        }
    }
}
