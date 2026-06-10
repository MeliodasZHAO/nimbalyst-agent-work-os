package com.nimbalyst.app.data

import androidx.room.Entity

@Entity(
    tableName = "agent_work_os_configs",
    primaryKeys = ["scope", "projectId"]
)
data class AgentWorkOSConfigEntity(
    val scope: String,
    val projectId: String,
    val configJson: String,
    val updatedAt: Long,
)
