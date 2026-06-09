package com.nimbalyst.app.utils

import android.content.Context
import com.nimbalyst.app.R
import java.text.DateFormat
import java.util.Date

object RelativeTimestamp {
    fun format(context: Context, epochMs: Long): String {
        val now = System.currentTimeMillis()
        val seconds = ((now - epochMs) / 1000).toInt()

        return when {
            seconds < 60 -> context.getString(R.string.time_now)
            seconds < 3600 -> context.getString(R.string.time_minutes_ago, seconds / 60)
            seconds < 86400 -> context.getString(R.string.time_hours_ago, seconds / 3600)
            seconds < 604800 -> context.getString(R.string.time_days_ago, seconds / 86400)
            else -> DateFormat.getDateInstance(DateFormat.SHORT).format(Date(epochMs))
        }
    }
}
