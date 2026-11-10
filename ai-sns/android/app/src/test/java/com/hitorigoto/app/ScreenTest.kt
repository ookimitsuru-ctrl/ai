package com.hitorigoto.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.hitorigoto.app.data.AppJson
import com.hitorigoto.app.data.NotificationsResponse
import com.hitorigoto.app.data.PersonasResponse
import com.hitorigoto.app.data.PostView
import com.hitorigoto.app.data.PostsResponse
import com.hitorigoto.app.ui.home.HomeScreen
import com.hitorigoto.app.ui.home.HomeUiState
import com.hitorigoto.app.ui.home.Tab
import com.hitorigoto.app.ui.register.RegisterScreen
import com.hitorigoto.app.ui.register.RegisterUiState
import com.hitorigoto.app.ui.theme.HitorigotoTheme
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * 画面のテスト。エミュレータなしで、パソコン上で本物の Compose 画面を描画して操作する。
 * サーバーが実際に返したデータ(test/resources/fixtures)を表示するので、見た目も実データで確認できる。
 * `-Proborazzi.test.record=true` を付けて実行すると、build/screens/ に画面の画像も出力する。
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-port-xxhdpi")
class ScreenTest {
    @get:Rule val rule = createComposeRule()

    private val posts = AppJson.decodeFromString<PostsResponse>(fixture("posts.json")).posts
    private val personas = AppJson.decodeFromString<PersonasResponse>(fixture("personas.json")).personas
    private val notes = AppJson.decodeFromString<NotificationsResponse>(fixture("notifications.json"))
    private val now = posts.maxOf { it.createdAt } + 2 * 60_000

    private fun full(
        posts: List<PostView> = this.posts,
        offline: Boolean = false,
        message: String? = null,
        sending: Boolean = false,
        unread: Int = notes.unreadCount,
    ) = HomeUiState(
        loaded = true,
        posts = posts,
        personas = personas,
        notifications = notes.notifications,
        unreadCount = unread,
        offline = offline,
        message = message,
        sending = sending,
    )

    private class Calls {
        val posted = mutableListOf<String>()
        var markRead = 0
        var deleted = 0
        var consumed = 0
        val savedUrls = mutableListOf<String>()
    }

    private fun show(
        state: HomeUiState,
        calls: Calls = Calls(),
        tab: Tab = Tab.Timeline,
        dark: Boolean = false,
    ): Calls {
        rule.setContent {
            HitorigotoTheme(darkTheme = dark) {
                HomeScreen(
                    state = state,
                    nickname = "みつる",
                    serverUrl = "http://10.0.2.2:8787",
                    nowMs = now,
                    onPost = { text, ok -> calls.posted += text; ok() },
                    onMarkAllRead = { calls.markRead++ },
                    onSaveServerUrl = { calls.savedUrls += it },
                    onDeleteAccount = { calls.deleted++ },
                    onConsumeMessage = { calls.consumed++ },
                    initialTab = tab,
                )
            }
        }
        return calls
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/$name.png")
    }

    // ---------- タイムライン ----------
    @Test fun `タイムライン_本物のデータ(話題・返信・いいね)が表示される`() {
        show(full())
        rule.onNodeWithText("朝ラン。筋トレもした").assertIsDisplayed() // 一番新しいつぶやき
        rule.onNodeWithText("ランニング").assertIsDisplayed() // 話題タグ
        rule.onAllNodesWithText("@", substring = true).fetchSemanticsNodes().let { assertTrue("返信のハンドル表示", it.isNotEmpty()) }
        shot("01_timeline")
    }

    @Test fun `タイムライン_処理中のつぶやきは「読んでいます」を出す`() {
        val processing = PostView("p", "いま投稿したばかり", now - 5_000, "processing")
        show(full(posts = listOf(processing) + posts))
        rule.onNodeWithText("フォロワーが読んでいます…").assertIsDisplayed()
        rule.onNodeWithText("たった今").assertIsDisplayed()
        shot("02_timeline_processing")
    }

    @Test fun `タイムライン_つぶやきが無いときは案内を出す`() {
        show(HomeUiState(loaded = true, personas = personas.map { it.copy(locked = true) }))
        rule.onNodeWithText("最初のつぶやきをしてみましょう").assertIsDisplayed()
        shot("03_timeline_empty")
    }

    @Test fun `入力欄_空だと送れず、入力すると送れる。文字数が出る`() {
        show(full())
        rule.onNodeWithText("つぶやく").assertIsNotEnabled()
        rule.onNodeWithText("0/140").assertIsDisplayed()
        rule.onNodeWithText("いまどうしてる?").performTextInput("こんにちは")
        rule.onNodeWithText("5/140").assertIsDisplayed()
        rule.onNodeWithText("つぶやく").assertIsEnabled()
    }

    @Test fun `入力欄_140字を超えると送れない`() {
        show(full())
        rule.onNodeWithText("いまどうしてる?").performTextInput("あ".repeat(141))
        rule.onNodeWithText("141/140").assertIsDisplayed()
        rule.onNodeWithText("つぶやく").assertIsNotEnabled()
    }

    @Test fun `入力欄_送ると本文が渡され、入力欄は空に戻る`() {
        val calls = show(full())
        rule.onNodeWithText("いまどうしてる?").performTextInput("朝ランした")
        rule.onNodeWithText("つぶやく").performClick()
        assertEquals(listOf("朝ランした"), calls.posted)
        rule.onNodeWithText("0/140").assertIsDisplayed()
    }

    @Test fun `入力欄_送信中は押せない`() {
        show(full(sending = true))
        rule.onNodeWithText("つぶやく").assertDoesNotExistOrDisabled()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertDoesNotExistOrDisabled() {
        // 送信中はボタンの文字が進行表示に変わる(=「つぶやく」の文字が無い)
        val exists = runCatching { assertIsDisplayed() }.isSuccess
        assertFalse(exists)
    }

    // ---------- フォロワー ----------
    @Test fun `フォロワー_20枠のうち出会った人数と、未解放は???で出る`() {
        show(full(), tab = Tab.Followers)
        rule.onNodeWithText("フォロワー 8/20").assertIsDisplayed()
        assertTrue(rule.onAllNodesWithText("???").fetchSemanticsNodes().isNotEmpty())
        assertTrue(rule.onAllNodesWithText("まだ出会っていない人").fetchSemanticsNodes().isNotEmpty())
        shot("04_followers")
    }

    @Test fun `フォロワー_タップすると詳細が開き、戻れる`() {
        show(full(), tab = Tab.Followers)
        val first = personas.first { !it.locked }
        rule.onNodeWithText(first.name!!).performClick()
        rule.onNodeWithText("あなたとのやりとり").assertIsDisplayed()
        rule.onNodeWithText(first.bio!!).assertIsDisplayed()
        rule.onNodeWithText("@${first.handle}").assertIsDisplayed()
        shot("05_persona_detail")
        rule.onNodeWithContentDescription("戻る").performClick()
        rule.onNodeWithText("フォロワー 8/20").assertIsDisplayed()
    }

    @Test fun `フォロワー_未解放のカードを押しても何も開かない`() {
        show(full(), tab = Tab.Followers)
        rule.onAllNodesWithText("???")[0].performClick()
        rule.onNodeWithText("フォロワー 8/20").assertIsDisplayed() // 詳細に移っていない
    }

    // ---------- 通知 ----------
    @Test fun `通知_未読数のバッジが出て、開くと既読を依頼する`() {
        val calls = show(full())
        rule.onNodeWithText("19", useUnmergedTree = true).assertIsDisplayed() // タブのバッジ
        rule.onNodeWithText("通知").performClick()
        rule.waitForIdle()
        assertEquals(1, calls.markRead)
        rule.onNodeWithText("まだ通知はありません。つぶやくと、フォローやいいね、返信がここに届きます。").let {
            assertFalse(runCatching { it.assertIsDisplayed() }.isSuccess)
        }
        shot("06_notifications")
    }

    @Test fun `通知_種類ごとの文言が出る`() {
        show(full(), tab = Tab.Notifications)
        assertTrue(rule.onAllNodesWithText("さんがフォローしました", substring = true).fetchSemanticsNodes().isNotEmpty())
    }

    @Test fun `通知_空のときは案内を出す`() {
        show(HomeUiState(loaded = true), tab = Tab.Notifications)
        rule.onNodeWithText("まだ通知はありません。つぶやくと、フォローやいいね、返信がここに届きます。").assertIsDisplayed()
    }

    // ---------- 設定 ----------
    @Test fun `設定_ニックネーム・人数・接続先が出る`() {
        show(full(), tab = Tab.Settings)
        rule.onNodeWithText("みつる").assertIsDisplayed()
        rule.onNodeWithText("フォロワー 8 人").assertIsDisplayed()
        rule.onNodeWithText("http://10.0.2.2:8787").assertIsDisplayed()
        rule.onNodeWithText("保存").assertIsNotEnabled() // 変えていないので押せない
        shot("07_settings")
    }

    @Test fun `設定_接続先を変えると保存できる`() {
        val calls = show(full(), tab = Tab.Settings)
        rule.onNodeWithText("http://10.0.2.2:8787").performTextReplacement("http://192.168.1.10:8787")
        rule.onNodeWithText("保存").assertIsEnabled().performClick()
        assertEquals(listOf("http://192.168.1.10:8787"), calls.savedUrls)
    }

    @Test fun `設定_データ削除は確認ダイアログを経て、やめるなら削除しない`() {
        val calls = show(full(), tab = Tab.Settings)
        rule.onNodeWithText("すべて削除する").performClick()
        rule.onNodeWithText("すべて削除しますか?").assertIsDisplayed()
        rule.waitForIdle()
        rule.onAllNodes(isRoot()).onLast().captureRoboImage("build/screens/08_delete_dialog.png") // ダイアログは別ウィンドウ
        rule.onNodeWithText("やめる").performClick()
        assertEquals(0, calls.deleted)
        rule.onNodeWithText("すべて削除する").performClick()
        rule.onNodeWithText("削除する").performClick()
        assertEquals(1, calls.deleted)
    }

    // ---------- その他 ----------
    @Test fun `つながらないときは、画面の上に知らせる`() {
        show(full(offline = true))
        rule.onNodeWithText("サーバーにつながりません。つながるまで待っています…").assertIsDisplayed()
        rule.onNodeWithText("朝ラン。筋トレもした").assertIsDisplayed() // 前のデータは見えたまま
    }

    @Test fun `メッセージはスナックバーで一度だけ見せる`() {
        val calls = show(full(message = "今日の投稿上限(10回)に達しました。明日またつぶやいてね"))
        rule.waitForIdle()
        rule.onNodeWithText("今日の投稿上限(10回)に達しました。明日またつぶやいてね").assertIsDisplayed()
        assertEquals(0, calls.consumed) // 表示している間は、まだ消費しない(すぐ消すと表示が消えてしまう)
        rule.mainClock.advanceTimeBy(6_000) // スナックバーの表示時間が過ぎる
        rule.waitForIdle()
        assertEquals(1, calls.consumed)
    }

    @Test fun `ダークテーマでも表示できる`() {
        show(full(), dark = true)
        rule.onNodeWithText("朝ラン。筋トレもした").assertIsDisplayed()
        shot("09_timeline_dark")
    }

    // ---------- 登録画面 ----------
    @Composable
    private fun Register(state: RegisterUiState, log: MutableList<String>) {
        HitorigotoTheme(darkTheme = false) {
            RegisterScreen(
                state = state,
                onServerUrl = { log += "url:$it" },
                onInviteCode = { log += "invite:$it" },
                onNickname = { log += "nick:$it" },
                onSubmit = { log += "submit" },
            )
        }
    }

    @Test fun `登録画面_入力と送信が伝わり、架空の人物であることを明記している`() {
        val log = mutableListOf<String>()
        rule.setContent { Register(RegisterUiState(serverUrl = "http://10.0.2.2:8787"), log) }
        rule.onNodeWithText("登場する人はすべてAIによる架空の人物です。").assertIsDisplayed()
        rule.onNodeWithText("招待コード").performTextInput("ABCD1234")
        rule.onNodeWithText("はじめる").performClick()
        assertEquals(listOf("invite:ABCD1234", "submit"), log)
        shot("10_register")
    }

    @Test fun `登録画面_エラーを表示し、登録中は押せない`() {
        rule.setContent { Register(RegisterUiState(serverUrl = "u", error = "招待コードが正しくないか、すでに使われています"), mutableListOf()) }
        rule.onNodeWithText("招待コードが正しくないか、すでに使われています").assertIsDisplayed()
        shot("11_register_error")
    }

    @Test fun `登録画面_登録中は「はじめる」が押せない`() {
        rule.setContent { Register(RegisterUiState(serverUrl = "u", loading = true), mutableListOf()) }
        assertFalse(runCatching { rule.onNodeWithText("はじめる").assertIsDisplayed() }.isSuccess) // 文字が進行表示に変わる
    }
}
