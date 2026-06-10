package com.nimbalyst.app.data

import com.google.gson.JsonParser
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentWorkOSMigrationTest {
    @Test
    fun `migration declares v1 to v2 upgrade`() {
        assertEquals(1, MIGRATION_1_2.startVersion)
        assertEquals(2, MIGRATION_1_2.endVersion)
    }

    @Test
    fun `migration creates Agent Work OS Room tables`() {
        val statements = mutableListOf<String>()
        val db = Proxy.newProxyInstance(
            SupportSQLiteDatabase::class.java.classLoader,
            arrayOf(SupportSQLiteDatabase::class.java)
        ) { _, method, args ->
            if (method.name == "execSQL" && args?.firstOrNull() is String) {
                statements += args.first() as String
            }
            when (method.returnType) {
                java.lang.Boolean.TYPE -> false
                java.lang.Integer.TYPE -> 0
                java.lang.Long.TYPE -> 0L
                else -> null
            }
        } as SupportSQLiteDatabase

        MIGRATION_1_2.migrate(db)

        assertTrue(statements.any { it.contains("CREATE TABLE IF NOT EXISTS agent_work_os_configs") })
        assertTrue(statements.any { it.contains("PRIMARY KEY(scope, projectId)") })
        assertTrue(statements.any { it.contains("CREATE TABLE IF NOT EXISTS mobile_permission_policies") })
        assertTrue(statements.any { it.contains("mode TEXT NOT NULL DEFAULT 'balanced'") })
    }

    @Test
    fun `exported Room schema includes Agent Work OS tables`() {
        val schemaFile = listOf(
            File("app/schemas/com.nimbalyst.app.data.NimbalystDatabase/2.json"),
            File("schemas/com.nimbalyst.app.data.NimbalystDatabase/2.json"),
        ).firstOrNull { it.exists() } ?: File("app/schemas/com.nimbalyst.app.data.NimbalystDatabase/2.json")
        assertTrue("Room schema v2 must be exported", schemaFile.exists())

        val schema = JsonParser.parseString(schemaFile.readText()).asJsonObject
        assertEquals(2, schema.getAsJsonObject("database").get("version").asInt)
        val entities = schema.getAsJsonObject("database").getAsJsonArray("entities")
        val agentConfig = entities.firstOrNull {
            it.asJsonObject.get("tableName").asString == "agent_work_os_configs"
        }?.asJsonObject
        val mobilePolicy = entities.firstOrNull {
            it.asJsonObject.get("tableName").asString == "mobile_permission_policies"
        }?.asJsonObject

        assertNotNull(agentConfig)
        assertNotNull(mobilePolicy)
        assertEquals(listOf("scope", "projectId"), primaryKeyColumns(agentConfig!!))
        assertEquals(listOf("projectId"), primaryKeyColumns(mobilePolicy!!))
        assertEquals(setOf("scope", "projectId", "configJson", "updatedAt"), fieldNames(agentConfig))
        assertEquals(setOf("projectId", "mode", "policyJson", "updatedAt"), fieldNames(mobilePolicy))
    }

    @Test
    fun `default mobile policy is balanced and keeps risky approvals on desktop`() {
        val json = JsonParser.parseString(AgentWorkOSDefaults.defaultMobilePermissionPolicyJson).asJsonObject

        assertEquals("balanced", json.get("mode").asString)
        assertTrue(json.get("allowPlanApproval").asBoolean)
        assertTrue(json.get("allowToolPermissionApproval").asBoolean)
        assertFalse(json.get("allowCommitApproval").asBoolean)
        assertFalse(json.get("allowDatabaseRiskApproval").asBoolean)
        assertFalse(json.get("allowSecurityRiskApproval").asBoolean)
        assertFalse(json.get("allowDestructiveRiskApproval").asBoolean)
        assertTrue(json.get("requireDesktopForShipped").asBoolean)
    }

    private fun primaryKeyColumns(entity: com.google.gson.JsonObject): List<String> {
        return entity
            .getAsJsonObject("primaryKey")
            .getAsJsonArray("columnNames")
            .map { it.asString }
    }

    private fun fieldNames(entity: com.google.gson.JsonObject): Set<String> {
        return entity
            .getAsJsonArray("fields")
            .map { it.asJsonObject.get("columnName").asString }
            .toSet()
    }
}
