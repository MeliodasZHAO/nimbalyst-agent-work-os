package com.nimbalyst.app.data

object AgentWorkOSDefaults {
    const val SYSTEM_PROJECT_ID = "__system__"
    const val DEFAULT_MOBILE_POLICY_MODE = "balanced"

    val defaultMobilePermissionPolicyJson: String = """
        {
          "mode": "balanced",
          "allowPlanApproval": true,
          "allowToolPermissionApproval": true,
          "allowCommitApproval": false,
          "allowDatabaseRiskApproval": false,
          "allowSecurityRiskApproval": false,
          "allowDestructiveRiskApproval": false,
          "requireDesktopForShipped": true
        }
    """.trimIndent()
}
