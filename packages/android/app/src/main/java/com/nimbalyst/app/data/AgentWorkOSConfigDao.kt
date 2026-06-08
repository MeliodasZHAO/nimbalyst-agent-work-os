package com.nimbalyst.app.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface AgentWorkOSConfigDao {
    @Query("SELECT * FROM agent_work_os_configs WHERE scope = :scope AND projectId = :projectId LIMIT 1")
    suspend fun get(scope: String, projectId: String): AgentWorkOSConfigEntity?

    @Query("SELECT * FROM agent_work_os_configs WHERE scope = :scope AND projectId = :projectId LIMIT 1")
    fun observe(scope: String, projectId: String): Flow<AgentWorkOSConfigEntity?>

    @Upsert
    suspend fun upsert(config: AgentWorkOSConfigEntity)
}
