package com.nimbalyst.app.sync

import com.nimbalyst.app.data.MobilePermissionPolicy
import com.nimbalyst.app.data.MobilePermissionPolicyMode

fun SyncedMobilePermissionPolicy.toMobilePermissionPolicy(): MobilePermissionPolicy =
    basePolicyForMode(MobilePermissionPolicyMode.fromWireValue(mode)).let { base ->
        base.copy(
            allowPlanApproval = allowPlanApproval ?: base.allowPlanApproval,
            allowToolPermissionApproval = allowToolPermissionApproval ?: base.allowToolPermissionApproval,
            allowCommitApproval = allowCommitApproval ?: base.allowCommitApproval,
            allowDatabaseRiskApproval = allowDatabaseRiskApproval ?: base.allowDatabaseRiskApproval,
            allowSecurityRiskApproval = allowSecurityRiskApproval ?: base.allowSecurityRiskApproval,
            allowDestructiveRiskApproval = allowDestructiveRiskApproval ?: base.allowDestructiveRiskApproval,
            requireDesktopForShipped = requireDesktopForShipped ?: base.requireDesktopForShipped,
        )
    }

fun SyncedProjectConfig.mobilePermissionPolicyOrNull(): MobilePermissionPolicy? =
    agentWorkOSConfig?.mobilePermissions?.toMobilePermissionPolicy()

private fun basePolicyForMode(mode: MobilePermissionPolicyMode): MobilePermissionPolicy =
    when (mode) {
        MobilePermissionPolicyMode.Strict -> MobilePermissionPolicy.strict()
        MobilePermissionPolicyMode.Balanced -> MobilePermissionPolicy.balanced()
        MobilePermissionPolicyMode.Flexible -> MobilePermissionPolicy.flexible()
        MobilePermissionPolicyMode.Custom -> MobilePermissionPolicy.balanced().copy(mode = MobilePermissionPolicyMode.Custom)
    }
