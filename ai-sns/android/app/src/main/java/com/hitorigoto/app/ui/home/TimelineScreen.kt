package com.hitorigoto.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.hitorigoto.app.ui.Avatar
import com.hitorigoto.app.ui.MAX_POST_CHARS
import com.hitorigoto.app.ui.TagRow
import com.hitorigoto.app.ui.charCount
import com.hitorigoto.app.ui.isPostable
import com.hitorigoto.app.ui.relativeTime

@Composable
fun TimelineScreen(
    posts: List<PostView>,
    followerCount: Int,
    sending: Boolean,
    nowMs: Long,
    onPost: (text: String, onSuccess: () -> Unit) -> Unit,
    onOpenThread: (PostView, Reaction) -> Unit,
    onToggleLike: (Reaction) -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 12.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Composer(sending = sending, onPost = onPost)
        }
        if (posts.isEmpty()) {
            item { EmptyTimeline(followerCount) }
        }
        items(posts, key = { it.id }) { post ->
            PostCard(post, nowMs, onOpenThread, onToggleLike)
        }
    }
}

@Composable
private fun Composer(sending: Boolean, onPost: (String, () -> Unit) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val count = charCount(text)
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("いまどうしてる?") },
                minLines = 2,
                maxLines = 5,
                enabled = !sending,
            )
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "$count/$MAX_POST_CHARS",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (count > MAX_POST_CHARS) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { onPost(text) { text = "" } },
                    enabled = !sending && isPostable(text),
                ) {
                    if (sending) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("つぶやく")
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyTimeline(followerCount: Int) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("🗨️", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(8.dp))
        Text("最初のつぶやきをしてみましょう", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            if (followerCount == 0) "話題に興味を持った人が、少しずつフォローしてくれます。" else "フォロワーが反応してくれるかも。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun PostCard(
    post: PostView,
    nowMs: Long,
    onOpenThread: (PostView, Reaction) -> Unit,
    onToggleLike: (Reaction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(post.body, style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(6.dp))
            Text(
                relativeTime(nowMs, post.createdAt),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (post.topics.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                TagRow(post.topics.map { it.label })
            }
            if (post.isProcessing) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "フォロワーが読んでいます…",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (post.reactions.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
                post.replies.forEach { r -> ReplyRow(r, onOpen = { onOpenThread(post, r) }, onToggleLike = { onToggleLike(r) }) }
                if (post.likes.isNotEmpty()) LikesRow(post.likes)
            }
        }
    }
}

@Composable
private fun ReplyRow(r: Reaction, onOpen: () -> Unit, onToggleLike: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Avatar(r.persona.name, r.persona.handle, size = 32.dp)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.persona.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "  @${r.persona.handle}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(r.text.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(2.dp))
            Text(
                when {
                    r.replying -> "返事を考えています…"
                    r.thread.isNotEmpty() -> "会話を見る(${r.thread.size})"
                    else -> "返信する"
                },
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        IconButton(onClick = onToggleLike, modifier = Modifier.size(36.dp)) {
            Icon(
                if (r.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (r.liked) "いいねを取り消す" else "いいね",
                tint = if (r.liked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun LikesRow(likes: List<Reaction>) {
    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("♥", color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.width(6.dp))
        Text(
            likes.joinToString("、") { it.persona.name } + " がいいねしました",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
