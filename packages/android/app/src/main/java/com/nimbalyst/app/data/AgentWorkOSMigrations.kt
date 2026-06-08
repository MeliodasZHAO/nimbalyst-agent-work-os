package com.nimbalyst.app.data

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS agent_work_os_configs (
                scope TEXT NOT NULL,
                projectId TEXT NOT NULL,
                configJson TEXT NOT NULL,
                updatedAt INTEGER NOT NULL,
                PRIMARY KEY(scope, projectId)
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS mobile_permission_policies (
                projectId TEXT NOT NULL PRIMARY KEY,
                mode TEXT NOT NULL DEFAULT 'balanced',
                policyJson TEXT NOT NULL,
                updatedAt INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }
}
