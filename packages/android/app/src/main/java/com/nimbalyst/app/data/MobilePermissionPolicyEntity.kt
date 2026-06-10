package com.nimbalyst.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "mobile_permission_policies")
data class MobilePermissionPolicyEntity(
    @PrimaryKey val projectId: String,
    val mode: String = "balanced",
    val policyJson: String,
    val updatedAt: Long,
)
