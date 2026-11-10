package com.hitorigoto.app

import com.hitorigoto.app.data.ApiException
import com.hitorigoto.app.data.NotificationView
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.Reaction
import com.hitorigoto.app.data.ReactionPersona
import com.hitorigoto.app.ui.charCount
import com.hitorigoto.app.ui.errorMessage
import com.hitorigoto.app.ui.interactionsWith
import com.hitorigoto.app.ui.isPostable
import com.hitorigoto.app.ui.notificationTitle
import com.hitorigoto.app.ui.pollIntervalMs
import com.hitorigoto.app.ui.relativeTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class LogicTest {
    private val now = 1_800_000_000_000L
    private val min = 60_000L

    @Test fun `相対時刻`() {
        assertEquals("たった今", relativeTime(now, now - 5_000))
        assertEquals("たった今", relativeTime(now, now + 5_000)) // 時計のずれで未来でも壊れない
        assertEquals("3分前", relativeTime(now, now - 3 * min))
        assertEquals("2時間前", relativeTime(now, now - 120 * min))
        assertEquals("3日前", relativeTime(now, now - 3 * 24 * 60 * min))
        assertTrue(relativeTime(now, now - 30L * 24 * 60 * min).endsWith("日")) // 「M月d日」
    }

    private fun post(createdAt: Long, status: String) = PostView("p", "x", createdAt, status)

    @Test fun `問い合わせ間隔は、反応が来そうな間だけ短い`() {
        assertEquals(4_000, pollIntervalMs(listOf(post(now - 60 * min, "processing")), now)) // 処理中
        assertEquals(4_000, pollIntervalMs(listOf(post(now - 2 * min, "done")), now)) // 投稿直後
        assertEquals(15_000, pollIntervalMs(listOf(post(now - 10 * min, "done")), now)) // 静か
        assertEquals(15_000, pollIntervalMs(emptyList(), now))
    }

    private fun persona(id: String, name: String) = ReactionPersona(id, name, id)
    private fun note(type: String) = NotificationView("n", type, now, false, persona("kenji_run", "田中ケンジ"))

    @Test fun `通知の見出し`() {
        assertEquals("田中ケンジさんがフォローしました", notificationTitle(note("follow")))
        assertEquals("田中ケンジさんがいいねしました", notificationTitle(note("like")))
        assertEquals("田中ケンジさんが返信しました", notificationTitle(note("reply")))
    }

    @Test fun `あるフォロワーとのやりとりだけを取り出す`() {
        val kenji = persona("kenji_run", "田中ケンジ")
        val miyu = persona("miyu_cafe", "星野ミユ")
        val p1 = PostView("p1", "走った", 2, "done", reactions = listOf(Reaction("r1", "reply", "最高っす", 3, kenji), Reaction("r2", "like", null, 3, miyu)))
        val p2 = PostView("p2", "カフェ", 1, "done", reactions = listOf(Reaction("r3", "like", null, 4, kenji)))
        val r = interactionsWith(listOf(p1, p2), "kenji_run")
        assertEquals(listOf("r1", "r3"), r.map { it.reaction.id })
        assertEquals(listOf("p1", "p2"), r.map { it.post.id })
        assertTrue(interactionsWith(listOf(p1, p2), "nobody").isEmpty())
    }

    @Test fun `返信といいねの見分け`() {
        val k = persona("k", "K")
        assertTrue(Reaction("a", "reply", "こんにちは", 0, k).isReply)
        assertFalse(Reaction("a", "reply", "  ", 0, k).isReply) // 本文が空の返信は返信として扱わない
        assertTrue(Reaction("a", "like", null, 0, k).isLike)
    }

    @Test fun `つぶやけるかの判定(絵文字は1文字、前後の空白は無視)`() {
        assertFalse(isPostable(""))
        assertFalse(isPostable("   "))
        assertTrue(isPostable("a"))
        assertTrue(isPostable("あ".repeat(140)))
        assertFalse(isPostable("あ".repeat(141)))
        assertTrue(isPostable("👍".repeat(140))) // サロゲートペアでも140文字までOK
        assertFalse(isPostable("👍".repeat(141)))
        assertEquals(3, charCount("a👍b"))
        assertTrue(isPostable("  " + "あ".repeat(140) + "  "))
    }

    @Test fun `エラーの文言`() {
        assertTrue(errorMessage(ApiException(403, "invalid_invite")).contains("招待コード"))
        assertTrue(errorMessage(ApiException(429, "daily_limit", limit = 10)).contains("10回"))
        assertTrue(errorMessage(ApiException(400, "invalid_length", max = 140)).contains("140"))
        assertTrue(errorMessage(ApiException(500, "internal_error")).contains("500"))
        assertTrue(errorMessage(IOException("boom")).contains("つながりません"))
        assertEquals("うまくいきませんでした", errorMessage(IllegalStateException()))
    }
}
