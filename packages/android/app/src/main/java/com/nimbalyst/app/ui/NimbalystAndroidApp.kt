package com.nimbalyst.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.ViewKanban
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nimbalyst.app.NimbalystApplication
import com.nimbalyst.app.R
import com.nimbalyst.app.analytics.AnalyticsManager
import kotlinx.coroutines.launch

@Composable
fun NimbalystAndroidApp() {
    val app = LocalContext.current.applicationContext as NimbalystApplication
    val context = LocalContext.current
    val pairingState by app.pairingStore.state.collectAsState()
    val coroutineScope = rememberCoroutineScope()

    // Track app open
    LaunchedEffect(Unit) {
        val packageInfo = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0)
        }.getOrNull()
        AnalyticsManager.capture(
            "mobile_app_opened",
            mapOf(
                "platform" to "android",
                "nimbalyst_mobile_version" to (packageInfo?.versionName ?: "unknown")
            )
        )
    }

    // Auto-connect sync when credentials are ready
    LaunchedEffect(pairingState.credentials) {
        if (pairingState.isSyncConfigured) {
            app.syncManager.connectIfConfigured()
        } else {
            app.syncManager.disconnect()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            app.syncManager.leaveSessionRoom()
        }
    }

    // State-driven navigation matching iOS: Pairing -> Login -> Main app
    when {
        !pairingState.isPaired -> {
            PairingScreen(
                onPaired = { credentials ->
                    app.pairingStore.savePairing(credentials)
                }
            )
        }

        !pairingState.isAuthenticated -> {
            LoginScreen(
                serverUrl = pairingState.credentials?.serverUrl ?: "",
                pairedEmail = pairingState.credentials?.pairedUserId,
                onUnpair = {
                    app.syncManager.disconnect()
                    coroutineScope.launch {
                        app.repository.clearPrototypeData()
                    }
                    app.pairingStore.clearPairing()
                }
            )
        }

        else -> {
            MainApp()
        }
    }
}

@Composable
private fun MainApp() {
    val app = LocalContext.current.applicationContext as NimbalystApplication
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val navController = rememberNavController()

    // Request notification permission once after auth
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        app.notificationManager.handlePermissionResult(granted)
    }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            app.notificationManager.handlePermissionResult(true)
        }
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val isTabRoute = currentRoute in TAB_ROUTES

    // Badge count for the inbox tab: sessions blocked on the user's response
    val activeSessions by app.repository.observeActiveSessions().collectAsState(initial = emptyList())
    val attentionCount = remember(activeSessions) {
        activeSessions.count { it.hasQueuedPrompts && !it.isExecuting }
    }

    Scaffold(
        bottomBar = {
            if (isTabRoute) {
                MainNavigationBar(
                    currentRoute = currentRoute,
                    attentionCount = attentionCount,
                    onNavigate = { route ->
                        navController.navigate(route) {
                            popUpTo("projects") { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "projects",
            modifier = Modifier.padding(innerPadding)
        ) {
        composable("projects") {
            ProjectListScreen(navController = navController)
        }

        composable("inbox") {
            InboxScreen(navController = navController)
        }

        composable("board") {
            BoardScreen(navController = navController)
        }

        composable(
            "sessions?projectId={projectId}&name={projectName}",
            arguments = listOf(
                navArgument("projectId") { type = NavType.StringType },
                navArgument("projectName") { type = NavType.StringType; defaultValue = "Sessions" }
            )
        ) { backStackEntry ->
            val projectId = backStackEntry.arguments?.getString("projectId") ?: return@composable
            val projectName = backStackEntry.arguments?.getString("projectName") ?: "Sessions"
            SessionListScreen(
                projectId = projectId,
                projectName = projectName,
                navController = navController
            )
        }

        composable(
            "sessions/{sessionId}",
            arguments = listOf(
                navArgument("sessionId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
            SessionDetailScreen(
                sessionId = sessionId,
                onBack = { navController.popBackStack() }
            )
        }

        composable("settings") {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onSignOut = {
                    // Clear auth but keep pairing -- goes to LoginScreen
                    val existing = app.pairingStore.state.value.credentials ?: return@SettingsScreen
                    app.syncManager.disconnect()
                    app.pairingStore.savePairing(
                        existing.copy(
                            authJwt = null,
                            authUserId = null,
                            orgId = null,
                            sessionToken = null,
                            authEmail = null,
                            authExpiresAt = null
                        )
                    )
                },
                onUnpair = {
                    app.syncManager.disconnect()
                    coroutineScope.launch {
                        app.repository.clearPrototypeData()
                    }
                    app.pairingStore.clearPairing()
                    AnalyticsManager.capture("mobile_device_unpairing")
                    AnalyticsManager.reset()
                }
            )
        }
        }
    }
}

private val TAB_ROUTES = setOf("projects", "inbox", "board")

@Composable
private fun MainNavigationBar(
    currentRoute: String?,
    attentionCount: Int,
    onNavigate: (String) -> Unit,
) {
    NavigationBar {
        NavigationBarItem(
            selected = currentRoute == "projects",
            onClick = { onNavigate("projects") },
            icon = { Icon(Icons.Default.Folder, contentDescription = null) },
            label = { Text(stringResource(R.string.nav_projects)) }
        )
        NavigationBarItem(
            selected = currentRoute == "inbox",
            onClick = { onNavigate("inbox") },
            icon = {
                if (attentionCount > 0) {
                    BadgedBox(badge = { Badge { Text(attentionCount.toString()) } }) {
                        Icon(Icons.Default.Inbox, contentDescription = null)
                    }
                } else {
                    Icon(Icons.Default.Inbox, contentDescription = null)
                }
            },
            label = { Text(stringResource(R.string.nav_inbox)) }
        )
        NavigationBarItem(
            selected = currentRoute == "board",
            onClick = { onNavigate("board") },
            icon = { Icon(Icons.Default.ViewKanban, contentDescription = null) },
            label = { Text(stringResource(R.string.nav_board)) }
        )
    }
}
