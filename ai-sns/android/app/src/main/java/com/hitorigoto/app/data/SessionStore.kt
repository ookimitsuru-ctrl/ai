package com.hitorigoto.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

/**
 * 端末に保存する情報。個人情報は持たない(匿名のトークンとニックネーム、接続先URLだけ)。
 * loaded=false の間は、まだ保存先から読み込み中。
 */
data class SessionState(
    val loaded: Boolean = false,
    val serverUrl: String = DEFAULT_SERVER_URL,
    val token: String? = null,
    val nickname: String? = null,
) {
    val isLoggedIn get() = token != null

    companion object {
        /** エミュレータから、同じMacで動いているサーバーを見るときのアドレス。実機ではMacのIPに変える */
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:8787"
    }
}

interface SessionStore {
    val state: StateFlow<SessionState>
    suspend fun load()
    suspend fun setServerUrl(url: String)
    suspend fun login(token: String, nickname: String)
    /** トークンを消す(接続先URLは残す) */
    suspend fun logout()
}

private val Context.dataStore by preferencesDataStore(name = "session")

class DataStoreSessionStore(private val context: Context) : SessionStore {
    private val keyUrl = stringPreferencesKey("server_url")
    private val keyToken = stringPreferencesKey("token")
    private val keyNickname = stringPreferencesKey("nickname")

    private val _state = MutableStateFlow(SessionState())
    override val state: StateFlow<SessionState> = _state

    override suspend fun load() {
        val p = context.dataStore.data.first()
        _state.value = SessionState(
            loaded = true,
            serverUrl = p[keyUrl] ?: SessionState.DEFAULT_SERVER_URL,
            token = p[keyToken],
            nickname = p[keyNickname],
        )
    }

    override suspend fun setServerUrl(url: String) {
        context.dataStore.edit { it[keyUrl] = url }
        _state.value = _state.value.copy(serverUrl = url)
    }

    override suspend fun login(token: String, nickname: String) {
        context.dataStore.edit {
            it[keyToken] = token
            it[keyNickname] = nickname
        }
        _state.value = _state.value.copy(token = token, nickname = nickname)
    }

    override suspend fun logout() {
        context.dataStore.edit {
            it.remove(keyToken)
            it.remove(keyNickname)
        }
        _state.value = _state.value.copy(token = null, nickname = null)
    }
}
