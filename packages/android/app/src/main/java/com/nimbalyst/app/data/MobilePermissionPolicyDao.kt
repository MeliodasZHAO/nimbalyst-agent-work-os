package com.nimbalyst.app.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface MobilePermissionPolicyDao {
    @Query("SELECT * FROM mobile_permission_policies WHERE projectId = :projectId LIMIT 1")
    suspend fun get(projectId: String): MobilePermissionPolicyEntity?

    @Query("SELECT * FROM mobile_permission_policies WHERE projectId = :projectId LIMIT 1")
    fun observe(projectId: String): Flow<MobilePermissionPolicyEntity?>

    @Upsert
    suspend fun upsert(policy: MobilePermissionPolicyEntity)
}
