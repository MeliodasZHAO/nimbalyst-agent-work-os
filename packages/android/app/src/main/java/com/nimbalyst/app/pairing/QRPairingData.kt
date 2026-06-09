package com.nimbalyst.app.pairing

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.net.URLDecoder

data class QRPairingData(
    val seed: String,
    val serverUrl: String,
    val userId: String,
    val analyticsId: String? = null,
    val personalOrgId: String? = null,
    val personalUserId: String? = null,
    // Auth session fields (v6+) — instant auth without separate login
    val authSessionToken: String? = null,
    val authSessionJwt: String? = null,
    val authUserId: String? = null,
    val authOrgId: String? = null,
    val authEmail: String? = null,
) {
    companion object {
        fun parse(rawValue: String): QRPairingData? {
            if (rawValue.isBlank()) {
                return null
            }

            return when {
                rawValue.startsWith("nimbalyst://pair") -> parseFromDeepLink(rawValue)
                else -> parseJson(rawValue)
            }
        }

        private fun parseFromDeepLink(urlString: String): QRPairingData? {
            val dataMatch = Regex("""[?&]data=([^&]+)""").find(urlString) ?: return null
            val decoded = runCatching {
                val encodedPayload = URLDecoder.decode(dataMatch.groupValues[1], StandardCharsets.UTF_8)
                String(
                    Base64.getDecoder().decode(normalizeBase64(encodedPayload)),
                    StandardCharsets.UTF_8
                )
            }.getOrNull() ?: return null

            return parseJson(decoded)
        }

        private fun parseJson(rawJson: String): QRPairingData? {
            val json = runCatching {
                JsonParser.parseString(rawJson).asJsonObject
            }.getOrNull() ?: return null

            val serverUrl = json.string("serverUrl") ?: return null
            val seed = json.string("encryptionKeySeed") ?: json.string("seed") ?: return null
            val userId = json.string("syncEmail")
                ?: json.string("userId")
                ?: json.string("analyticsId")
                ?: return null

            val expiresAt = json.long("expiresAt")
            if (expiresAt != null && expiresAt < System.currentTimeMillis()) {
                return null
            }

            return QRPairingData(
                seed = seed,
                serverUrl = serverUrl,
                userId = userId,
                analyticsId = json.string("analyticsId"),
                personalOrgId = json.string("personalOrgId"),
                personalUserId = json.string("personalUserId"),
                authSessionToken = json.string("authSessionToken"),
                authSessionJwt = json.string("authSessionJwt"),
                authUserId = json.string("authUserId"),
                authOrgId = json.string("authOrgId"),
                authEmail = json.string("authEmail"),
            )
        }
    }
}

private fun normalizeBase64(value: String): String {
    val normalized = value
        .replace('-', '+')
        .replace('_', '/')
    val padding = normalized.length % 4
    return if (padding == 0) {
        normalized
    } else {
        normalized + "=".repeat(4 - padding)
    }
}

private fun JsonObject.string(key: String): String? {
    if (!has(key) || get(key).isJsonNull) {
        return null
    }
    return get(key).asString.takeIf { it.isNotBlank() }
}

private fun JsonObject.long(key: String): Long? {
    if (!has(key) || get(key).isJsonNull) {
        return null
    }
    return runCatching { get(key).asLong }.getOrNull()
}
