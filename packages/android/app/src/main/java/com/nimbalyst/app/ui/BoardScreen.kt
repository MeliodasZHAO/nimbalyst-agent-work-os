package com.nimbalyst.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.nimbalyst.app.NimbalystApplication
import com.nimbalyst.app.R
import com.nimbalyst.app.ui.components.AttentionSessionCard
import com.nimbalyst.app.ui.components.ConnectionIndicator
import com.nimbalyst.app.ui.components.phaseStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Kanban phase display order -- matches the desktop board columns. */
private val PHASE_ORDER = listOf("backlog", "planning", "implementing", "validating", "complete")

/**
 * Read-only kanban board: sessions across all projects grouped by phase.
 * Phases are set on desktop (or by the agent); the mobile board mirrors them.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardScreen(navController: NavController) {
    val app = LocalContext.current.applicationContext as NimbalystApplication
    val sessions by app.repository.observeActiveSessions().collectAsState(initial = emptyList())
    val projects by app.repository.observeProjects().collectAsState(initial = emptyList())
    val syncState by app.syncManager.state.collectAsState()
    val connectedDevices by app.syncManager.connectedDevices.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    val projectNames = remember(projects) { projects.associate { it.id to it.name } }
    val byPhase = remember(sessions) {
        sessions
            .filter { it.phase in PHASE_ORDER }
            .groupBy { it.phase!! }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.board_title)) },
            actions = {
                ConnectionIndicator(
                    syncState = syncState,
                    connectedDevices = connectedDevices,
                    modifier = Modifier.padding(end = 16.dp)
                )
            }
        )

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                app.syncManager.requestFullSync()
                coroutineScope.launch {
                    delay(1000)
                    isRefreshing = false
                }
            },
            modifier = Modifier.fillMaxSize()
        ) {
            if (byPhase.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.board_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PHASE_ORDER.forEach { phase ->
                        val phaseSessions = byPhase[phase] ?: return@forEach
                        item(key = "phase-$phase") {
                            PhaseHeader(phase = phase, count = phaseSessions.size)
                        }
                        items(phaseSessions, key = { it.id }) { session ->
                            AttentionSessionCard(
                                session = session,
                                projectName = projectNames[session.projectId],
                                onClick = { navController.navigate("sessions/${session.id}") },
                                // The section header already names the phase
                                showPhase = false
                            )
                        }
                    }
                    item { Spacer(modifier = Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun PhaseHeader(phase: String, count: Int) {
    val style = phaseStyle(phase) ?: return
    Row(
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(style.color)
        )
        Text(
            text = stringResource(style.labelRes),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
