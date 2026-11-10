package com.hitorigoto.app.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.hitorigoto.app.data.Reaction
import com.hitorigoto.app.ui.interactionsWith

enum class Tab(val label: String, val icon: ImageVector) {
    Timeline("タイムライン", Icons.Filled.Home),
    Followers("フォロワー", Icons.Filled.Person),
    Notifications("通知", Icons.Filled.Notifications),
    Settings("設定", Icons.Filled.Settings),
}

/**
 * ログイン後のメイン画面(下のタブ4つ)。状態を持たない見た目だけの部分は、各 *Screen に分けてある。
 * 画面ごとに状態(HomeUiState)と操作(コールバック)を受け取るので、ViewModel なしで表示確認・テストができる。
 */
@Composable
fun HomeScreen(
    state: HomeUiState,
    nickname: String?,
    serverUrl: String,
    nowMs: Long,
    onPost: (String, () -> Unit) -> Unit,
    onToggleLike: (Reaction) -> Unit,
    onSendThreadMessage: (Reaction, String, () -> Unit) -> Unit,
    onMarkAllRead: () -> Unit,
    onSaveServerUrl: (String) -> Unit,
    onDeleteAccount: () -> Unit,
    onConsumeMessage: () -> Unit,
    initialTab: Tab = Tab.Timeline,
) {
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    var openPersonaId by rememberSaveable { mutableStateOf<String?>(null) }
    // 開いている会話(つぶやきID と 返信ID)。画面のたびに最新の状態から引き直すので、返事が届けば自動で現れる
    var openThread by rememberSaveable { mutableStateOf<Pair<String, String>?>(null) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            onConsumeMessage()
        }
    }
    // 通知タブを見ている間は、新しく届いたものも含めて既読にする
    LaunchedEffect(tab, state.unreadCount) {
        if (tab == Tab.Notifications && state.unreadCount > 0) onMarkAllRead()
    }
    BackHandler(enabled = openPersonaId != null || openThread != null) {
        if (openThread != null) openThread = null else openPersonaId = null
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = {
                            tab = t
                            openPersonaId = null
                            openThread = null
                        },
                        icon = {
                            if (t == Tab.Notifications && state.unreadCount > 0) {
                                BadgedBox(badge = { Badge { Text(state.unreadCount.coerceAtMost(99).toString()) } }) {
                                    Icon(t.icon, contentDescription = t.label)
                                }
                            } else {
                                Icon(t.icon, contentDescription = t.label)
                            }
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { inner ->
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Box(Modifier.fillMaxSize()) {
                if (state.offline) OfflineBanner(Modifier.align(Alignment.TopCenter).padding(top = inner.calculateTopPadding()))
                val pad = if (state.offline) PaddingValues(top = inner.calculateTopPadding() + 32.dp, bottom = inner.calculateBottomPadding()) else inner
                val opened = state.personas.firstOrNull { !it.locked && it.id == openPersonaId }
                val threadPost = openThread?.let { (postId, _) -> state.posts.firstOrNull { it.id == postId } }
                val threadReaction = openThread?.let { (_, rid) -> threadPost?.reactions?.firstOrNull { it.id == rid } }
                when {
                    tab == Tab.Timeline && threadPost != null && threadReaction != null -> ThreadScreen(
                        post = threadPost,
                        reaction = threadReaction,
                        sending = state.threadSending,
                        onSend = { text, ok -> onSendThreadMessage(threadReaction, text, ok) },
                        onToggleLike = { onToggleLike(threadReaction) },
                        onBack = { openThread = null },
                        contentPadding = pad,
                    )
                    tab == Tab.Followers && opened != null -> PersonaDetailScreen(
                        persona = opened,
                        interactions = interactionsWith(state.posts, opened.id!!),
                        nowMs = nowMs,
                        onBack = { openPersonaId = null },
                        contentPadding = pad,
                    )
                    tab == Tab.Timeline -> TimelineScreen(
                        posts = state.posts,
                        followerCount = state.followerCount,
                        sending = state.sending,
                        nowMs = nowMs,
                        onPost = onPost,
                        onOpenThread = { post, r -> openThread = post.id to r.id },
                        onToggleLike = onToggleLike,
                        contentPadding = pad,
                    )
                    tab == Tab.Followers -> FollowersScreen(
                        personas = state.personas,
                        onOpen = { openPersonaId = it.id },
                        contentPadding = pad,
                    )
                    tab == Tab.Notifications -> NotificationsScreen(
                        notifications = state.notifications,
                        nowMs = nowMs,
                        // 返信の通知をタップすると、タイムラインでその会話が開く
                        onOpen = { n ->
                            if (n.postId != null && n.reactionId != null) {
                                tab = Tab.Timeline
                                openThread = n.postId to n.reactionId
                            }
                        },
                        contentPadding = pad,
                    )
                    else -> SettingsScreen(
                        nickname = nickname ?: state.me?.nickname,
                        followerCount = state.followerCount,
                        serverUrl = serverUrl,
                        onSaveServerUrl = onSaveServerUrl,
                        onDeleteAccount = onDeleteAccount,
                        contentPadding = pad,
                    )
                }
            }
        }
    }
}

@Composable
private fun OfflineBanner(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth()) {
        Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
            Text(
                "サーバーにつながりません。つながるまで待っています…",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
    }
}
