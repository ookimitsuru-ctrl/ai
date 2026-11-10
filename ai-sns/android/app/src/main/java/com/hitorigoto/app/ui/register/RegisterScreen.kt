package com.hitorigoto.app.ui.register

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** はじめて開いたときの画面。招待コードを入れて、匿名で登録する(メールアドレスなどは不要) */
@Composable
fun RegisterScreen(
    state: RegisterUiState,
    onServerUrl: (String) -> Unit,
    onInviteCode: (String) -> Unit,
    onNickname: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            Text("ひとりごと", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(
                "つぶやくと、話題に興味を持った人が少しずつフォローしてくれる、ひとりごとSNS。",
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                "登場する人はすべてAIによる架空の人物です。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = state.inviteCode,
                onValueChange = onInviteCode,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("招待コード") },
                singleLine = true,
                enabled = !state.loading,
            )
            OutlinedTextField(
                value = state.nickname,
                onValueChange = onNickname,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("ニックネーム(任意)") },
                singleLine = true,
                enabled = !state.loading,
            )
            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = onServerUrl,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("接続先サーバー") },
                supportingText = { Text("エミュレータなら既定のまま。実機では Mac の IP(例: http://192.168.1.10:8787)") },
                singleLine = true,
                enabled = !state.loading,
            )
            if (state.error != null) {
                Text(state.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
            Button(onClick = onSubmit, enabled = !state.loading, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                if (state.loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("はじめる")
                }
            }
        }
    }
}
