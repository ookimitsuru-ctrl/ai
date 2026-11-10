package com.hitorigoto.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.Reaction
import com.hitorigoto.app.data.ThreadMessage
import com.hitorigoto.app.ui.Avatar
import com.hitorigoto.app.ui.MAX_POST_CHARS
import com.hitorigoto.app.ui.charCount
import com.hitorigoto.app.ui.isPostable

/**
 * フォロワーの返信についての会話画面。
 * 元のつぶやき → フォロワーの最初の返信 → 自分とフォロワーのやりとり、の順に並ぶ。
 * 返事を待っている間は「考えています…」を出し、次の発言は送れない。
 */
@Composable
fun ThreadScreen(
    post: PostView,
    reaction: Reaction,
    sending: Boolean,
    onSend: (text: String, onSuccess: () -> Unit) -> Unit,
    onToggleLike: () -> Unit,
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    var text by rememberSaveable { mutableStateOf("") }
    val waiting = reaction.replying || sending
    val listState = rememberLazyListState()
    // 新しい発言(自分の送信・フォロワーの返事)が増えたら、いちばん下まで送る
    LaunchedEffect(reaction.thread.size, reaction.replying) {
        val last = reaction.thread.size + 2 + (if (reaction.replying) 1 else 0)
        if (last > 0) listState.animateScrollToItem(last - 1)
    }

    Column(modifier.fillMaxSize().padding(top = contentPadding.calculateTopPadding()).imePadding()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る") }
            Avatar(reaction.persona.name, reaction.persona.handle, size = 32.dp)
            Column(Modifier.padding(start = 10.dp)) {
                Text(reaction.persona.name, fontWeight = FontWeight.Bold)
                Text("@${reaction.persona.handle}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("あなたのつぶやき", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(post.body, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Avatar(reaction.persona.name, reaction.persona.handle, size = 32.dp, modifier = Modifier.padding(top = 4.dp))
                    Bubble(reaction.text.orEmpty(), mine = false, modifier = Modifier.weight(1f, fill = false))
                    IconButton(onClick = onToggleLike, modifier = Modifier.size(36.dp)) {
                        Icon(
                            if (reaction.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (reaction.liked) "いいねを取り消す" else "いいね",
                            tint = if (reaction.liked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
            items(reaction.thread, key = { it.id }) { m -> MessageRow(m, reaction) }
            if (reaction.replying) {
                item(key = "typing") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Avatar(reaction.persona.name, reaction.persona.handle, size = 32.dp)
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text("返事を考えています…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        // 入力欄(返事を待っている間は送れない)
        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = contentPadding.calculateBottomPadding().coerceAtLeast(8.dp))) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(if (waiting) "返事を待っています…" else "返信を書く") },
                        maxLines = 4,
                        enabled = !waiting,
                    )
                    IconButton(onClick = { onSend(text) { text = "" } }, enabled = !waiting && isPostable(text)) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "送信")
                    }
                }
                val n = charCount(text)
                if (n > 0) {
                    Text(
                        "$n/$MAX_POST_CHARS",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (n > MAX_POST_CHARS) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Spacer(Modifier.height(0.dp))
                }
            }
        }
    }
}

@Composable
private fun MessageRow(m: ThreadMessage, reaction: Reaction) {
    if (m.isMine) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) { Bubble(m.text, mine = true) }
    } else {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Avatar(reaction.persona.name, reaction.persona.handle, size = 32.dp, modifier = Modifier.padding(top = 4.dp))
            Bubble(m.text, mine = false, modifier = Modifier.weight(1f, fill = false))
        }
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.widthIn(max = 280.dp),
        shape = RoundedCornerShape(18.dp),
        color = if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        tonalElevation = if (mine) 0.dp else 1.dp,
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = if (mine) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
        )
    }
}
