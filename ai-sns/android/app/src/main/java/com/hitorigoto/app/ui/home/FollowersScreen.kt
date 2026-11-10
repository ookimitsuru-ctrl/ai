package com.hitorigoto.app.ui.home

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hitorigoto.app.data.PersonaSlot
import com.hitorigoto.app.ui.Avatar
import com.hitorigoto.app.ui.Interaction
import com.hitorigoto.app.ui.TagRow
import com.hitorigoto.app.ui.relativeTime
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** フォロワー一覧。20枠のうち、まだ出会っていない人は「???」 */
@Composable
fun FollowersScreen(
    personas: List<PersonaSlot>,
    onOpen: (PersonaSlot) -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val total = personas.size.takeIf { it > 0 } ?: 20
    val followed = personas.count { !it.locked }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = modifier,
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 12.dp,
        ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(2) }) {
            Column(Modifier.padding(bottom = 4.dp)) {
                Text("フォロワー $followed/$total", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "いろんな話題をつぶやくと、いろんな人が来てくれます。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(personas, key = { it.slot }) { p -> PersonaCard(p, onOpen) }
    }
}

@Composable
private fun PersonaCard(p: PersonaSlot, onOpen: (PersonaSlot) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().then(if (p.locked) Modifier else Modifier.clickable { onOpen(p) }),
        colors = CardDefaults.cardColors(
            containerColor = if (p.locked) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (p.locked) 0.dp else 1.dp),
        border = if (p.locked) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(p.name, p.handle, size = 56.dp)
            Spacer(Modifier.height(8.dp))
            if (p.locked) {
                Text("???", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "まだ出会っていない人",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(p.name.orEmpty(), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "@${p.handle}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    p.occupation.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** フォロワーの詳細。自己紹介・好きな話題・あなたとのやりとり */
@Composable
fun PersonaDetailScreen(
    persona: PersonaSlot,
    interactions: List<Interaction>,
    nowMs: Long,
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 4.dp,
            bottom = contentPadding.calculateBottomPadding() + 12.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る") }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(persona.name, persona.handle, size = 72.dp)
                Spacer(Modifier.width(16.dp))
                Column {
                    Text(persona.name.orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("@${persona.handle}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${persona.age}歳・${persona.occupation}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        item { Text(persona.bio.orEmpty(), style = MaterialTheme.typography.bodyLarge) }
        if (persona.personality.isNotEmpty()) {
            item {
                Section("性格") { TagRow(persona.personality) }
            }
        }
        if (persona.favoriteTopics.isNotEmpty()) {
            item {
                Section("好きな話題") { TagRow(persona.favoriteTopics) }
            }
        }
        persona.followedAt?.let { at ->
            item {
                Text(
                    "${SimpleDateFormat("M月d日", Locale.JAPAN).format(Date(at))}からフォロー中",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        item { Text("あなたとのやりとり", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (interactions.isEmpty()) {
            item {
                Text(
                    "まだやりとりはありません。この人が好きな話題をつぶやいてみましょう。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(interactions, key = { it.reaction.id }) { i ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp),
            ) {
                Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Text(
                        "あなた: ${i.post.body}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    if (i.reaction.isReply) {
                        Text(i.reaction.text.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Favorite, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("いいね", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Text(
                        relativeTime(nowMs, i.reaction.visibleAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        content()
    }
}
