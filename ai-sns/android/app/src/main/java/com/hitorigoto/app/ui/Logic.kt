package com.hitorigoto.app.ui

import com.hitorigoto.app.data.ApiException
import com.hitorigoto.app.data.NotificationView
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.Reaction
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 「たった今」「3分前」のような相対時刻。1週間以上前は日付 */
fun relativeTime(nowMs: Long, thenMs: Long): String {
    val sec = (nowMs - thenMs).coerceAtLeast(0) / 1000
    return when {
        sec < 60 -> "たった今"
        sec < 3600 -> "${sec / 60}分前"
        sec < 86_400 -> "${sec / 3600}時間前"
        sec < 7 * 86_400 -> "${sec / 86_400}日前"
        else -> SimpleDateFormat("M月d日", Locale.JAPAN).format(Date(thenMs))
    }
}

/** サーバーに問い合わせる間隔。反応が来そうな間(処理中、または投稿から4分以内)は短く、静かなときは長く */
fun pollIntervalMs(posts: List<PostView>, nowMs: Long): Long {
    val active = posts.any { it.isProcessing || nowMs - it.createdAt < ACTIVE_WINDOW_MS }
    return if (active) 4_000 else 15_000
}

private const val ACTIVE_WINDOW_MS = 4 * 60_000L

/** 通知1件の見出し */
fun notificationTitle(n: NotificationView): String = when (n.type) {
    "follow" -> "${n.persona.name}さんがフォローしました"
    "like" -> "${n.persona.name}さんがいいねしました"
    "reply" -> "${n.persona.name}さんが返信しました"
    else -> "${n.persona.name}さんからお知らせ"
}

/** あるフォロワーとの、これまでのやりとり(新しいつぶやきが先) */
data class Interaction(val post: PostView, val reaction: Reaction)

fun interactionsWith(posts: List<PostView>, personaId: String): List<Interaction> =
    posts.flatMap { post -> post.reactions.filter { it.persona.id == personaId }.map { Interaction(post, it) } }

/** 返せなかった/失敗したときの、利用者向けのメッセージ */
fun errorMessage(e: Throwable): String = when {
    e is ApiException && e.code == "invalid_invite" -> "招待コードが正しくないか、すでに使われています"
    e is ApiException && e.code == "invite_required" -> "招待コードを入力してください"
    e is ApiException && e.code == "invalid_nickname" -> "ニックネームは1〜20文字にしてください"
    e is ApiException && e.code == "daily_limit" ->
        "今日の上限(${e.limit ?: "?"}回)に達しました。明日またね"
    e is ApiException && e.code == "reply_pending" -> "返事を待っています。少し待ってから送ってね"
    e is ApiException && e.code == "thread_limit" -> "この会話は、これ以上続けられません(${e.limit ?: 20}回まで)"
    e is ApiException && e.code == "not_found" -> "この返信は見つかりませんでした"
    e is ApiException && e.code == "invalid_length" -> "つぶやきは${e.max ?: 140}文字までです"
    e is ApiException && e.status == 401 -> "ログインが無効になりました"
    e is ApiException -> "うまくいきませんでした(${e.status})"
    e is IOException -> "サーバーにつながりません。接続先のURLとネットワークを確認してください"
    else -> "うまくいきませんでした"
}

const val MAX_POST_CHARS = 140

/** つぶやきとして送れるか(前後の空白を除いて1〜140文字) */
fun isPostable(text: String): Boolean {
    val n = text.trim().codePointCount(0, text.trim().length)
    return n in 1..MAX_POST_CHARS
}

fun charCount(text: String): Int = text.codePointCount(0, text.length)
