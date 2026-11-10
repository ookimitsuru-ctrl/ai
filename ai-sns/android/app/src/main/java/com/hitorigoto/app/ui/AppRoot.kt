package com.hitorigoto.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.hitorigoto.app.AppContainer
import com.hitorigoto.app.ui.home.HomeScreen
import com.hitorigoto.app.ui.home.HomeViewModel
import com.hitorigoto.app.ui.register.AuthViewModel
import com.hitorigoto.app.ui.register.RegisterScreen
import kotlinx.coroutines.delay

/** 保存先の読み込み中 → 未登録なら登録画面 → 登録済みならメイン画面 */
@Composable
fun AppRoot(container: AppContainer) {
    val session by container.sessionStore.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { container.sessionStore.load() }

    when {
        !session.loaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        !session.isLoggedIn -> {
            val vm: AuthViewModel = viewModel(
                factory = viewModelFactory { initializer { AuthViewModel(container.api, container.sessionStore) } },
            )
            val s by vm.state.collectAsStateWithLifecycle()
            RegisterScreen(
                state = s,
                onServerUrl = vm::onServerUrl,
                onInviteCode = vm::onInviteCode,
                onNickname = vm::onNickname,
                onSubmit = vm::submit,
            )
        }
        else -> {
            // アカウントごとに別の ViewModel(削除→再登録したとき、前の状態を引きずらない)
            val vm: HomeViewModel = viewModel(
                key = session.token,
                factory = viewModelFactory { initializer { HomeViewModel(container.api, container.sessionStore) } },
            )
            val state by vm.state.collectAsStateWithLifecycle()

            // 画面が見えている間だけ、サーバーに問い合わせ続ける
            val lifecycle = LocalLifecycleOwner.current.lifecycle
            LaunchedEffect(vm, lifecycle) {
                lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { vm.pollLoop() }
            }
            // 「3分前」などの表示を更新するための現在時刻
            var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
            LaunchedEffect(Unit) {
                while (true) {
                    delay(30_000)
                    now = System.currentTimeMillis()
                }
            }
            HomeScreen(
                state = state,
                nickname = session.nickname,
                serverUrl = session.serverUrl,
                nowMs = maxOf(now, state.posts.maxOfOrNull { it.createdAt } ?: 0L),
                onPost = vm::post,
                onToggleLike = vm::toggleLike,
                onSendThreadMessage = vm::sendThreadMessage,
                onMarkAllRead = vm::markAllRead,
                onSaveServerUrl = vm::updateServerUrl,
                onDeleteAccount = vm::deleteAccount,
                onConsumeMessage = vm::consumeMessage,
            )
        }
    }
}
