package com.nimbalyst.app.data

import com.google.gson.Gson
import com.google.gson.JsonSyntaxException

enum class MobilePermissionPolicyMode(val wireValue: String, val label: String) {
    Strict("strict", "Strict"),
    Balanced("balanced", "Balanced"),
    Flexible("flexible", "Flexible"),
    Custom("custom", "Custom");

    companion object {
        fun fromWireValue(value: String?): MobilePermissionPolicyMode =
            entries.firstOrNull { it.wireValue == value } ?: Balanced
    }
}

data class MobilePermissionPolicy(
    val mode: MobilePermissionPolicyMode = MobilePermissionPolicyMode.Balanced,
    val allowPlanApproval: Boolean = true,
    val allowToolPermissionApproval: Boolean = true,
    val allowCommitApproval: Boolean = false,
    val allowDatabaseRiskApproval: Boolean = false,
    val allowSecurityRiskApproval: Boolean = false,
    val allowDestructiveRiskApproval: Boolean = false,
    val requireDesktopForShipped: Boolean = true,
) {
    fun withModePreset(mode: MobilePermissionPolicyMode): MobilePermissionPolicy =
        when (mode) {
            MobilePermissionPolicyMode.Strict -> strict()
            MobilePermissionPolicyMode.Balanced -> balanced()
            MobilePermissionPolicyMode.Flexible -> flexible()
            MobilePermissionPolicyMode.Custom -> copy(mode = MobilePermissionPolicyMode.Custom)
        }

    fun toEntity(projectId: String, updatedAt: Long = System.currentTimeMillis()): MobilePermissionPolicyEntity =
        MobilePermissionPolicyEntity(
            projectId = projectId,
            mode = mode.wireValue,
            policyJson = toJson(),
            updatedAt = updatedAt,
        )

    fun toJson(): String = gson.toJson(toWire())

    private fun toWire(): WireMobilePermissionPolicy =
        WireMobilePermissionPolicy(
            mode = mode.wireValue,
            allowPlanApproval = allowPlanApproval,
            allowToolPermissionApproval = allowToolPermissionApproval,
            allowCommitApproval = allowCommitApproval,
            allowDatabaseRiskApproval = allowDatabaseRiskApproval,
            allowSecurityRiskApproval = allowSecurityRiskApproval,
            allowDestructiveRiskApproval = allowDestructiveRiskApproval,
            requireDesktopForShipped = requireDesktopForShipped,
        )

    companion object {
        private val gson = Gson()

        fun strict() = MobilePermissionPolicy(
            mode = MobilePermissionPolicyMode.Strict,
            allowPlanApproval = false,
            allowToolPermissionApproval = false,
            allowCommitApproval = false,
            allowDatabaseRiskApproval = false,
            allowSecurityRiskApproval = false,
            allowDestructiveRiskApproval = false,
            requireDesktopForShipped = true,
        )

        fun balanced() = MobilePermissionPolicy()

        fun flexible() = MobilePermissionPolicy(
            mode = MobilePermissionPolicyMode.Flexible,
            allowPlanApproval = true,
            allowToolPermissionApproval = true,
            allowCommitApproval = true,
            allowDatabaseRiskApproval = false,
            allowSecurityRiskApproval = false,
            allowDestructiveRiskApproval = false,
            requireDesktopForShipped = true,
        )

        fun fromEntity(entity: MobilePermissionPolicyEntity?): MobilePermissionPolicy {
            if (entity == null) return balanced()
            return fromJson(entity.policyJson).copy(mode = MobilePermissionPolicyMode.fromWireValue(entity.mode))
        }

        fun fromJson(json: String): MobilePermissionPolicy {
            val wire = try {
                gson.fromJson(json, WireMobilePermissionPolicy::class.java)
            } catch (_: JsonSyntaxException) {
                null
            } ?: return balanced()

            return MobilePermissionPolicy(
                mode = MobilePermissionPolicyMode.fromWireValue(wire.mode),
                allowPlanApproval = wire.allowPlanApproval ?: true,
                allowToolPermissionApproval = wire.allowToolPermissionApproval ?: true,
                allowCommitApproval = wire.allowCommitApproval ?: false,
                allowDatabaseRiskApproval = wire.allowDatabaseRiskApproval ?: false,
                allowSecurityRiskApproval = wire.allowSecurityRiskApproval ?: false,
                allowDestructiveRiskApproval = wire.allowDestructiveRiskApproval ?: false,
                requireDesktopForShipped = wire.requireDesktopForShipped ?: true,
            )
        }
    }
}

private data class WireMobilePermissionPolicy(
    val mode: String? = null,
    val allowPlanApproval: Boolean? = null,
    val allowToolPermissionApproval: Boolean? = null,
    val allowCommitApproval: Boolean? = null,
    val allowDatabaseRiskApproval: Boolean? = null,
    val allowSecurityRiskApproval: Boolean? = null,
    val allowDestructiveRiskApproval: Boolean? = null,
    val requireDesktopForShipped: Boolean? = null,
)
