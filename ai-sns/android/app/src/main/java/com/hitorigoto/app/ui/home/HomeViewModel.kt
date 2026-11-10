package com.hitorigoto.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hitorigoto.app.data.ApiException
import com.hitorigoto.app.data.Me
import com.hitorigoto.app.data.NotificationView
import com.hitorigoto.app.data.PersonaSlot
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.Reaction
import com.hitorigoto.app.data.SessionStore
import com.hitorigoto.app.data.SnsApi
import com.hitorigoto.app.ui.errorMessage
import com.hitorigoto.app.ui.isPostable
import com.hitorigoto.app.ui.pollIntervalMs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val loaded: Boolean = false,
    val me: Me? = null,
    val posts: List<PostView> = emptyList(),
    val personas: List<PersonaSlot> = emptyList(),
    val notifications: List<NotificationView> = emptyList(),
    val unreadCount: Int = 0,
    val sending: Boolean = false,
    /** スレッドに送信中 */
    val threadSending: Boolean = false,
    /** 直近の取得に失敗している(つながっていない) */
    val offline: Boolean = false,
    /** 操作の結果として一度だけ見せるメッセージ(スナックバー) */
    val message: String? = null,
) {
    val followerCount get() = personas.count { !it.locked }
}

class HomeViewModel(
    private val api: SnsApi,
    private val store: SessionStore,
    private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    /** 画面が見えている間、サーバーに定期的に問い合わせ続ける(プッシュ通知を入れるまでの代わり) */
    suspend fun pollLoop() {
        while (true) {
            refresh()
            delay(pollIntervalMs(_state.value.posts, clock()))
        }
    }

    suspend fun refresh() {
        try {
            val s = coroutineScope {
                val me = async { api.me() }
                val posts = async { api.posts() }
                val personas = async { api.personas() }
                val notes = async { api.notifications() }
                Fetched(me.await(), posts.await(), personas.await(), notes.await().notifications, notes.await().unreadCount)
            }
            _state.update {
                it.copy(
                    loaded = true,
                    me = s.me,
                    posts = s.posts,
                    personas = s.personas,
                    notifications = s.notifications,
                    unreadCount = s.unread,
                    offline = false,
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            if (e.isUnauthorized) store.logout() else _state.update { it.copy(offline = true, loaded = true) }
        } catch (e: Exception) {
            _state.update { it.copy(offline = true, loaded = true) }
        }
    }

    private class Fetched(
        val me: Me,
        val posts: List<PostView>,
        val personas: List<PersonaSlot>,
        val notifications: List<NotificationView>,
        val unread: Int,
    )

    /** つぶやく。成功したら onSuccess(入力欄を空にする)を呼ぶ */
    fun post(text: String, onSuccess: () -> Unit) {
        if (_state.value.sending || !isPostable(text)) return
        _state.update { it.copy(sending = true) }
        viewModelScope.launch {
            try {
                api.createPost(text.trim())
                onSuccess()
                _state.update { it.copy(sending = false) }
                refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (e is ApiException && e.isUnauthorized) store.logout()
                _state.update { it.copy(sending = false, message = errorMessage(e)) }
            }
        }
    }

    /** フォロワーの返信にいいね(すでにいいね済みなら取り消し)。まず画面に反映し、サーバーが失敗したら元に戻す */
    fun toggleLike(reaction: Reaction) {
        val want = !reaction.liked
        setLikedLocally(reaction.id, want)
        viewModelScope.launch {
            try {
                api.setLike(reaction.id, want)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                setLikedLocally(reaction.id, !want)
                if (e is ApiException && e.isUnauthorized) store.logout()
                _state.update { it.copy(message = errorMessage(e)) }
            }
        }
    }

    private fun setLikedLocally(reactionId: String, liked: Boolean) = _state.update { s ->
        s.copy(posts = s.posts.map { p -> p.copy(reactions = p.reactions.map { if (it.id == reactionId) it.copy(liked = liked) else it }) })
    }

    /** スレッドに発言する。成功したら onSuccess(入力欄を空にする)。フォロワーの返事は、あとで取得して現れる */
    fun sendThreadMessage(reaction: Reaction, text: String, onSuccess: () -> Unit) {
        if (_state.value.threadSending || reaction.replying || !isPostable(text)) return
        _state.update { it.copy(threadSending = true) }
        viewModelScope.launch {
            try {
                api.sendThreadMessage(reaction.id, text.trim())
                onSuccess()
                _state.update { it.copy(threadSending = false) }
                refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (e is ApiException && e.isUnauthorized) store.logout()
                _state.update { it.copy(threadSending = false, message = errorMessage(e)) }
                // 返事待ち(409)などは、サーバーの状態に合わせ直す
                if (e is ApiException && e.code == "reply_pending") refresh()
            }
        }
    }

    /** 通知画面を開いたときに、全部を既読にする */
    fun markAllRead() {
        if (_state.value.unreadCount == 0) return
        viewModelScope.launch {
            try {
                val unread = api.markAllRead()
                _state.update { s ->
                    s.copy(unreadCount = unread, notifications = s.notifications.map { it.copy(read = true) })
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // 既読にできなくても、次の取得でやり直せる
            }
        }
    }

    /** アカウントと全データを削除し、登録画面に戻る */
    fun deleteAccount() {
        viewModelScope.launch {
            try {
                api.deleteMe()
                store.logout()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(message = errorMessage(e)) }
            }
        }
    }

    fun updateServerUrl(url: String) {
        viewModelScope.launch {
            store.setServerUrl(url.trim())
            _state.update { it.copy(message = "接続先を保存しました") }
            refresh()
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}
