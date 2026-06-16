package com.nimbalyst.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.nimbalyst.app.NimbalystApplication
import com.nimbalyst.app.R
import com.nimbalyst.app.ui.components.AttentionSessionCard
import com.nimbalyst.app.ui.components.ConnectionIndicator
import com.nimbalyst.app.ui.components.hasUnread
import com.nimbalyst.app.ui.components.needsResponse
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Inbox: aggregates sessions across all projects that need the user's
 * attention -- blocked on a pending prompt, currently executing, or with
 * unread updates. This is the "what needs me right now" view for mobile.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(navController: NavController) {
    val app = LocalContext.current.applicationContext as NimbalystApplication
    val sessions by app.repository.observeActiveSessions().collectAsState(initial = emptyList())
    val projects by app.repository.observeProjects().collectAsState(initial = emptyList())
    val syncState by app.syncManager.state.collectAsState()
    val connectedDevices by app.syncManager.connectedDevices.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    val projectNames = remember(projects) { projects.associate { it.id to it.name } }
    val waiting = remember(sessions) { sessions.filter { it.needsResponse() } }
    val running = remember(sessions) { sessions.filter { it.isExecuting } }
    val unread = remember(sessions) {
        sessions.filter { it.hasUnread() && !it.needsResponse() && !it.isExecuting }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.inbox_title)) },
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
            if (waiting.isEmpty() && running.isEmpty() && unread.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.inbox_empty),
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
                    if (waiting.isNotEmpty()) {
                        item(key = "header-waiting") {
                            SectionHeader(stringResource(R.string.inbox_waiting_section, waiting.size))
                        }
                        items(waiting, key = { "w-${it.id}" }) { session ->
                            AttentionSessionCard(
                                session = session,
                                projectName = projectNames[session.projectId],
                                onClick = { navController.navigate("sessions/${session.id}") }
                            )
                        }
                    }
                    if (running.isNotEmpty()) {
                        item(key = "header-running") {
                            SectionHeader(stringResource(R.string.inbox_running_section, running.size))
                        }
                        items(running, key = { "r-${it.id}" }) { session ->
                            AttentionSessionCard(
                                session = session,
                                projectName = projectNames[session.projectId],
                                onClick = { navController.navigate("sessions/${session.id}") }
                            )
                        }
                    }
                    if (unread.isNotEmpty()) {
                        item(key = "header-unread") {
                            SectionHeader(stringResource(R.string.inbox_unread_section, unread.size))
                        }
                        items(unread, key = { "u-${it.id}" }) { session ->
                            AttentionSessionCard(
                                session = session,
                                projectName = projectNames[session.projectId],
                                onClick = { navController.navigate("sessions/${session.id}") }
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
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
    )
}
