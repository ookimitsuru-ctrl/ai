package com.hitorigoto.app

import com.hitorigoto.app.data.CreatedPost
import com.hitorigoto.app.data.Me
import com.hitorigoto.app.data.NotificationView
import com.hitorigoto.app.data.NotificationsResponse
import com.hitorigoto.app.data.PersonaSlot
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.RegisterResponse
import com.hitorigoto.app.data.SessionState
import com.hitorigoto.app.data.SessionStore
import com.hitorigoto.app.data.SnsApi
import com.hitorigoto.app.data.ThreadMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

fun fixture(name: String): String =
    object {}.javaClass.getResourceAsStream("/fixtures/$name")!!.bufferedReader().use { it.readText() }

/** メモリ上だけのセッション保存(DataStore の代わり) */
class FakeSessionStore(initial: SessionState = SessionState(loaded = true)) : SessionStore {
    private val _state = MutableStateFlow(initial)
    override val state: StateFlow<SessionState> = _state
    override suspend fun load() { _state.value = _state.value.copy(loaded = true) }
    override suspend fun setServerUrl(url: String) { _state.value = _state.value.copy(serverUrl = url) }
    override suspend fun login(token: String, nickname: String) { _state.value = _state.value.copy(token = token, nickname = nickname) }
    override suspend fun logout() { _state.value = _state.value.copy(token = null, nickname = null) }
}

/** 台本どおりに答えるニセのAPI。呼ばれた回数も記録する */
class FakeApi : SnsApi {
    var me = Me("u1", "みつる", 0, 0)
    var posts: List<PostView> = emptyList()
    var personas: List<PersonaSlot> = emptyList()
    var notifications: List<NotificationView> = emptyList()
    var unread = 0
    var error: Throwable? = null
    var registerResult = RegisterResponse("u1", "tok", "みつる")

    val created = mutableListOf<String>()
    var markReadCalls = 0
    var deleteCalls = 0
    val registerCalls = mutableListOf<Pair<String, String?>>()
    val likeCalls = mutableListOf<Pair<String, Boolean>>()
    val threadSent = mutableListOf<Pair<String, String>>()

    private fun check() { error?.let { throw it } }
    override suspend fun register(inviteCode: String, nickname: String?): RegisterResponse { registerCalls += inviteCode to nickname; check(); return registerResult }
    override suspend fun me(): Me { check(); return me }
    override suspend fun deleteMe() { deleteCalls++; check() }
    override suspend fun personas(): List<PersonaSlot> { check(); return personas }
    override suspend fun createPost(body: String): CreatedPost { check(); created += body; return CreatedPost("new", body, 0) }
    override suspend fun posts(limit: Int): List<PostView> { check(); return posts }
    override suspend fun notifications(limit: Int): NotificationsResponse { check(); return NotificationsResponse(notifications, unread) }
    override suspend fun setLike(reactionId: String, liked: Boolean) { likeCalls += reactionId to liked; check() }
    override suspend fun sendThreadMessage(reactionId: String, body: String): ThreadMessage { check(); threadSent += reactionId to body; return ThreadMessage("m", "user", body, 0) }
    override suspend fun markAllRead(): Int { markReadCalls++; check(); unread = 0; return 0 }
}
