package com.hitorigoto.app

import com.hitorigoto.app.data.AppJson
import com.hitorigoto.app.data.ErrorBody
import com.hitorigoto.app.data.Me
import com.hitorigoto.app.data.NotificationsResponse
import com.hitorigoto.app.data.PersonasResponse
import com.hitorigoto.app.data.PostsResponse
import com.hitorigoto.app.data.LikeResponse
import com.hitorigoto.app.data.RegisterResponse
import com.hitorigoto.app.data.SendMessageResponse
import com.hitorigoto.app.data.UnreadResponse
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * サーバー(ai-sns/server)が実際に返した JSON(test/resources/fixtures)を、アプリが読めること。
 * サーバーのAPIを変えたらフィクスチャを取り直し、ここが落ちれば互換性の崩れに気づける。
 */
class ContractTest {
    @Test fun `登録の応答`() {
        val r = AppJson.decodeFromString<RegisterResponse>(fixture("register.json"))
        assertEquals("みつる", r.nickname)
        assertTrue(r.token.startsWith("v1."))
    }

    @Test fun `自分の情報`() {
        val me = AppJson.decodeFromString<Me>(fixture("me.json"))
        assertEquals("みつる", me.nickname)
        assertEquals(6, me.followerCount)
    }

    @Test fun `フォロワー一覧は20枠で、未フォローは名前もIDも無い`() {
        val ps = AppJson.decodeFromString<PersonasResponse>(fixture("personas.json")).personas
        assertEquals(20, ps.size)
        assertEquals((1..20).toList(), ps.map { it.slot })
        val open = ps.filter { !it.locked }
        val locked = ps.filter { it.locked }
        assertEquals(6, open.size)
        assertTrue(open.all { it.id != null && it.name != null && it.handle != null && it.bio != null && it.followedAt != null })
        assertTrue(open.any { it.favoriteTopics.isNotEmpty() && it.personality.isNotEmpty() })
        assertTrue(locked.all { it.id == null && it.name == null && it.handle == null && it.bio == null })
    }

    @Test fun `つぶやき一覧(話題・返信・いいね)`() {
        val posts = AppJson.decodeFromString<PostsResponse>(fixture("posts.json")).posts
        assertEquals(6, posts.size)
        assertTrue(posts.all { it.status == "done" && !it.isProcessing })
        assertTrue(posts.all { it.topics.isNotEmpty() })
        val reactions = posts.flatMap { it.reactions }
        assertEquals(9, reactions.size)
        assertTrue(reactions.any { it.isReply && !it.text.isNullOrBlank() })
        assertTrue(reactions.any { it.isLike && it.text == null })
        assertTrue(reactions.all { it.persona.name.isNotEmpty() && it.visibleAt > 0 })
    }

    @Test fun `処理中のつぶやきは話題もリアクションも空`() {
        val p = AppJson.decodeFromString<PostsResponse>(fixture("posts_processing.json")).posts.single()
        assertTrue(p.isProcessing)
        assertTrue(p.topics.isEmpty() && p.reactions.isEmpty())
    }

    @Test fun `通知一覧`() {
        val n = AppJson.decodeFromString<NotificationsResponse>(fixture("notifications.json"))
        assertEquals(17, n.unreadCount)
        assertTrue(n.notifications.map { it.type }.toSet().containsAll(setOf("follow", "reply")))
        val reply = n.notifications.first { it.type == "reply" }
        assertNotNull(reply.text)
        assertNotNull(reply.postId)
        assertNull(n.notifications.first { it.type == "follow" }.text)
        // 新しい順
        assertEquals(n.notifications.sortedByDescending { it.createdAt }.map { it.id }.toSet(), n.notifications.map { it.id }.toSet())
    }

    @Test fun `既読とエラー`() {
        assertEquals(0, AppJson.decodeFromString<UnreadResponse>(fixture("read.json")).unreadCount)
        assertEquals("invalid_invite", AppJson.decodeFromString<ErrorBody>(fixture("error_invalid_invite.json")).error)
    }

    @Test fun `サーバーが知らないフィールドを足しても壊れない`() {
        val me = AppJson.decodeFromString<Me>("""{"userId":"u","nickname":"n","createdAt":1,"followerCount":2,"newField":"x"}""")
        assertEquals(2, me.followerCount)
    }

    @Test fun `返信には、いいね済みか・スレッド・返事待ちが付く`() {
        val posts = AppJson.decodeFromString<PostsResponse>(fixture("posts.json")).posts
        val replies = posts.flatMap { it.reactions }.filter { it.isReply }
        assertTrue(replies.any { it.liked })
        val withThread = replies.first { it.thread.isNotEmpty() }
        assertEquals(listOf("user", "persona", "user", "persona"), withThread.thread.map { it.role })
        assertTrue(withThread.thread.filter { it.isMine }.map { it.text } == listOf("ありがとう!明日も走るよ", "おすすめのコースある?"))
        assertTrue(withThread.thread.all { it.text.isNotBlank() && it.createdAt > 0 })
        assertEquals(false, withThread.replying)
        // いいねだけのリアクションには、いいね・スレッドの情報は付かない(読み込むと既定値)
        val like = posts.flatMap { it.reactions }.first { it.isLike }
        assertTrue(!like.liked && like.thread.isEmpty())
    }

    @Test fun `返信の通知には、どのスレッドかが付く`() {
        val n = AppJson.decodeFromString<NotificationsResponse>(fixture("notifications.json")).notifications
        val replies = n.filter { it.type == "reply" }
        assertTrue(replies.isNotEmpty() && replies.all { it.reactionId != null && it.postId != null })
        // その reactionId は、つぶやき一覧の返信に実在する(画面でその会話を開ける)
        val posts = AppJson.decodeFromString<PostsResponse>(fixture("posts.json")).posts
        val ids = posts.flatMap { it.reactions }.map { it.id }.toSet()
        assertTrue(replies.all { it.reactionId in ids })
    }

    @Test fun `スレッドへの発言・いいね・エラーの応答`() {
        val m = AppJson.decodeFromString<SendMessageResponse>(fixture("thread_message_created.json")).message
        assertEquals("user", m.role)
        assertTrue(m.isMine)
        assertEquals(true, AppJson.decodeFromString<LikeResponse>(fixture("like.json")).liked)
        assertEquals("not_found", AppJson.decodeFromString<ErrorBody>(fixture("error_not_found.json")).error)
        val e = AppJson.decodeFromString<ErrorBody>(fixture("error_invalid_length.json"))
        assertEquals("invalid_length", e.error)
        assertEquals(140, e.max)
    }
}
