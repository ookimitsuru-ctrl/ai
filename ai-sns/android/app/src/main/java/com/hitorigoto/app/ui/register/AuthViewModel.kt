package com.hitorigoto.app.ui.register

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hitorigoto.app.data.SessionStore
import com.hitorigoto.app.data.SnsApi
import com.hitorigoto.app.ui.errorMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RegisterUiState(
    val serverUrl: String,
    val inviteCode: String = "",
    val nickname: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

class AuthViewModel(private val api: SnsApi, private val store: SessionStore) : ViewModel() {
    private val _state = MutableStateFlow(RegisterUiState(serverUrl = store.state.value.serverUrl))
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    fun onServerUrl(v: String) = _state.update { it.copy(serverUrl = v, error = null) }
    fun onInviteCode(v: String) = _state.update { it.copy(inviteCode = v, error = null) }
    fun onNickname(v: String) = _state.update { it.copy(nickname = v, error = null) }

    fun submit() {
        val s = _state.value
        if (s.loading) return
        if (s.serverUrl.isBlank()) {
            _state.update { it.copy(error = "サーバーのURLを入力してください") }
            return
        }
        if (s.inviteCode.isBlank()) {
            _state.update { it.copy(error = "招待コードを入力してください") }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                store.setServerUrl(s.serverUrl.trim())
                val nick = s.nickname.trim().ifEmpty { null }
                val res = api.register(s.inviteCode.trim(), nick)
                store.login(res.token, res.nickname)
                _state.update { it.copy(loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = errorMessage(e)) }
            }
        }
    }
}
