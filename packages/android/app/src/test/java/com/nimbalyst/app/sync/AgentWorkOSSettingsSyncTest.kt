package com.nimbalyst.app.sync

import com.nimbalyst.app.data.MobilePermissionPolicyMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentWorkOSSettingsSyncTest {
    @Test
    fun `synced flexible mode expands preset defaults`() {
        val policy = SyncedMobilePermissionPolicy(mode = "flexible").toMobilePermissionPolicy()

        assertEquals(MobilePermissionPolicyMode.Flexible, policy.mode)
        assertTrue(policy.allowPlanApproval)
        assertTrue(policy.allowToolPermissionApproval)
        assertTrue(policy.allowCommitApproval)
        assertFalse(policy.allowDatabaseRiskApproval)
        assertFalse(policy.allowSecurityRiskApproval)
        assertFalse(policy.allowDestructiveRiskApproval)
        assertTrue(policy.requireDesktopForShipped)
    }

    @Test
    fun `synced custom policy preserves explicit desktop switches`() {
        val policy = SyncedMobilePermissionPolicy(
            mode = "custom",
            allowCommitApproval = true,
            allowDatabaseRiskApproval = true,
            requireDesktopForShipped = false,
        ).toMobilePermissionPolicy()

        assertEquals(MobilePermissionPolicyMode.Custom, policy.mode)
        assertTrue(policy.allowPlanApproval)
        assertTrue(policy.allowToolPermissionApproval)
        assertTrue(policy.allowCommitApproval)
        assertTrue(policy.allowDatabaseRiskApproval)
        assertFalse(policy.allowSecurityRiskApproval)
        assertFalse(policy.allowDestructiveRiskApproval)
        assertFalse(policy.requireDesktopForShipped)
    }

    @Test
    fun `unknown synced mode falls back to balanced`() {
        val policy = SyncedMobilePermissionPolicy(mode = "future-mode").toMobilePermissionPolicy()

        assertEquals(MobilePermissionPolicyMode.Balanced, policy.mode)
        assertTrue(policy.allowPlanApproval)
        assertFalse(policy.allowCommitApproval)
    }

    @Test
    fun `project config exposes project-level mobile policy`() {
        val policy = SyncedProjectConfig(
            agentWorkOSConfig = SyncedAgentWorkOSConfig(
                mobilePermissions = SyncedMobilePermissionPolicy(
                    mode = "strict",
                    allowToolPermissionApproval = true,
                )
            )
        ).mobilePermissionPolicyOrNull()

        requireNotNull(policy)
        assertEquals(MobilePermissionPolicyMode.Strict, policy.mode)
        assertFalse(policy.allowPlanApproval)
        assertTrue(policy.allowToolPermissionApproval)
        assertFalse(policy.allowCommitApproval)
    }

    @Test
    fun `project config without Agent Work OS policy returns null`() {
        val policy = SyncedProjectConfig(
            commands = listOf(SyncedSlashCommand(name = "design", source = "project")),
            lastCommandsUpdate = 123L,
        ).mobilePermissionPolicyOrNull()

        assertEquals(null, policy)
    }
}
