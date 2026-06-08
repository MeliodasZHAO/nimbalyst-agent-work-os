package com.nimbalyst.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MobilePermissionPolicyTest {
    @Test
    fun `strict mode disables mobile approvals`() {
        val policy = MobilePermissionPolicy.balanced().withModePreset(MobilePermissionPolicyMode.Strict)

        assertEquals(MobilePermissionPolicyMode.Strict, policy.mode)
        assertFalse(policy.allowPlanApproval)
        assertFalse(policy.allowToolPermissionApproval)
        assertFalse(policy.allowCommitApproval)
        assertFalse(policy.allowDatabaseRiskApproval)
        assertFalse(policy.allowSecurityRiskApproval)
        assertFalse(policy.allowDestructiveRiskApproval)
        assertTrue(policy.requireDesktopForShipped)
    }

    @Test
    fun `flexible mode allows low risk commits but keeps high risk approvals on desktop`() {
        val policy = MobilePermissionPolicy.balanced().withModePreset(MobilePermissionPolicyMode.Flexible)

        assertEquals(MobilePermissionPolicyMode.Flexible, policy.mode)
        assertTrue(policy.allowPlanApproval)
        assertTrue(policy.allowToolPermissionApproval)
        assertTrue(policy.allowCommitApproval)
        assertFalse(policy.allowDatabaseRiskApproval)
        assertFalse(policy.allowSecurityRiskApproval)
        assertFalse(policy.allowDestructiveRiskApproval)
    }

    @Test
    fun `custom mode preserves existing switches`() {
        val policy = MobilePermissionPolicy.flexible()
            .copy(allowDatabaseRiskApproval = true)
            .withModePreset(MobilePermissionPolicyMode.Custom)

        assertEquals(MobilePermissionPolicyMode.Custom, policy.mode)
        assertTrue(policy.allowCommitApproval)
        assertTrue(policy.allowDatabaseRiskApproval)
    }

    @Test
    fun `entity round trip preserves policy json`() {
        val policy = MobilePermissionPolicy.flexible()
        val entity = policy.toEntity(projectId = "project-1", updatedAt = 42L)
        val roundTrip = MobilePermissionPolicy.fromEntity(entity)

        assertEquals("project-1", entity.projectId)
        assertEquals("flexible", entity.mode)
        assertEquals(42L, entity.updatedAt)
        assertEquals(policy, roundTrip)
    }

    @Test
    fun `invalid json falls back to balanced defaults`() {
        val policy = MobilePermissionPolicy.fromJson("{not-json")

        assertEquals(MobilePermissionPolicyMode.Balanced, policy.mode)
        assertTrue(policy.allowPlanApproval)
        assertFalse(policy.allowCommitApproval)
    }
}
