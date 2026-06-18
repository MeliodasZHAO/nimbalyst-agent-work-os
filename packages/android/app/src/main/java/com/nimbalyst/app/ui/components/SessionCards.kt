package com.nimbalyst.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nimbalyst.app.R
import com.nimbalyst.app.data.SessionEntity
import com.nimbalyst.app.utils.RelativeTimestamp

/**
 * Shared session display helpers: kanban phase labels/colors and the
 * cross-screen session card used by the inbox and board views.
 *
 * Phase values mirror the desktop kanban columns
 * (sessionKanban.ts: backlog/planning/implementing/validating/complete).
 */

data class PhaseStyle(val labelRes: Int, val color: Color)

fun phaseStyle(phase: String?): PhaseStyle? = when (phase) {
    "backlog" -> PhaseStyle(R.string.phase_backlog, Color(0xFF6B7280))
    "planning" -> PhaseStyle(R.string.phase_planning, Color(0xFF60A5FA))
    "implementing" -> PhaseStyle(R.string.phase_implementing, Color(0xFFEAB308))
    "validating" -> PhaseStyle(R.string.phase_validating, Color(0xFFA78BFA))
    "complete" -> PhaseStyle(R.string.phase_complete, Color(0xFF22C55E))
    else -> null
}

/** Small colored pill showing the session's kanban phase. */
@Composable
fun PhaseChip(phase: String?, modifier: Modifier = Modifier) {
    val style = phaseStyle(phase) ?: return
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(style.color.copy(alpha = 0.16f))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = stringResource(style.labelRes),
            style = MaterialTheme.typography.labelSmall,
            color = style.color
        )
    }
}

/** Amber pill flagging a session that is blocked waiting for the user. */
@Composable
fun NeedsResponseBadge(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFFF59E0B).copy(alpha = 0.18f))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = stringResource(R.string.badge_needs_response),
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFFB45309),
            fontWeight = FontWeight.SemiBold
        )
    }
}

fun SessionEntity.hasUnread(): Boolean =
    lastMessageAt != null && (lastReadAt == null || lastMessageAt > lastReadAt)

/** Session is blocked on a pending interactive prompt (question/permission/commit). */
fun SessionEntity.needsResponse(): Boolean = hasQueuedPrompts && !isExecuting

/**
 * Cross-project session card used by the inbox and board screens.
 * Shows project name as secondary context since these views aggregate
 * sessions across projects.
 */
@Composable
fun AttentionSessionCard(
    session: SessionEntity,
    projectName: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showPhase: Boolean = true,
) {
    val context = LocalContext.current
    val unread = session.hasUnread()

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (unread) {
                Box(
                    modifier = Modifier
                        .padding(end = 10.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = session.titleDecrypted ?: stringResource(R.string.session_untitled),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    modifier = Modifier.padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!projectName.isNullOrBlank()) {
                        Text(
                            text = projectName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    if (session.needsResponse()) {
                        NeedsResponseBadge()
                    }
                    if (showPhase) {
                        PhaseChip(session.phase)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = RelativeTimestamp.format(context, session.updatedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (session.isExecuting) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .size(14.dp),
                        strokeWidth = 2.dp
                    )
                }
            }
        }
    }
}
