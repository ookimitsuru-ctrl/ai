package com.hitorigoto.app

import com.hitorigoto.app.data.ApiException
import com.hitorigoto.app.data.AppJson
import com.hitorigoto.app.data.NotificationsResponse
import com.hitorigoto.app.data.PersonasResponse
import com.hitorigoto.app.data.PostsResponse
import com.hitorigoto.app.data.SessionState
import com.hitorigoto.app.ui.home.HomeViewModel
import com.hitorigoto.app.ui.register.AuthViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.decodeFromString
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private lateinit var api: FakeApi
    private lateinit var store: FakeSessionStore

    @Before fun setUp() {
        Dispatchers.setMain(dispatcher)
        api = FakeApi()
        store = FakeSessionStore(SessionState(loaded = true, token = "tok", nickname = "みつる"))
        // サーバーが実際に返したデータを入れておく
        api.posts = AppJson.decodeFromString<PostsResponse>(fixture("posts.json")).posts
        api.personas = AppJson.decodeFromString<PersonasResponse>(fixture("personas.json")).personas
        AppJson.decodeFromString<NotificationsResponse>(fixture("notifications.json")).let {
            api.notifications = it.notifications
            api.unread = it.unreadCount
        }
    }

    @After fun tearDown() = Dispatchers.resetMain()

    private fun home() = HomeViewModel(api, store, clock = { 0L })

    // ---------- HomeViewModel ----------
    @Test fun `取得すると、つぶやき・フォロワー・通知が入る`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val s = vm.state.value
        assertTrue(s.loaded)
        assertEquals(6, s.posts.size)
        assertEquals(6, s.followerCount)
        assertEquals(17, s.unreadCount)
        assertFalse(s.offline)
    }

    @Test fun `つながらないときは offline になり、前のデータは残る`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        api.error = IOException("down")
        vm.refresh()
        assertTrue(vm.state.value.offline)
        assertEquals(6, vm.state.value.posts.size) // 画面が空にならない
        api.error = null
        vm.refresh()
        assertFalse(vm.state.value.offline)
    }

    @Test fun `401 ならログアウトして登録画面に戻る`() = runTest(dispatcher) {
        api.error = ApiException(401, "unauthorized")
        home().refresh()
        assertNull(store.state.value.token)
    }

    @Test fun `つぶやくと送信され、成功したら入力欄を空にして再取得する`() = runTest(dispatcher) {
        val vm = home()
        var cleared = false
        vm.post("  こんにちは  ") { cleared = true }
        advanceUntilIdle()
        assertEquals(listOf("こんにちは"), api.created) // 前後の空白は取る
        assertTrue(cleared)
        assertFalse(vm.state.value.sending)
        assertTrue(vm.state.value.loaded) // 投稿後に再取得している
    }

    @Test fun `空・長すぎるつぶやきは送らない`() = runTest(dispatcher) {
        val vm = home()
        vm.post("   ") { }
        vm.post("あ".repeat(141)) { }
        advanceUntilIdle()
        assertTrue(api.created.isEmpty())
    }

    @Test fun `送信中に連打しても1回しか送らない`() = runTest(dispatcher) {
        val vm = home()
        vm.post("1回目") { }
        vm.post("2回目") { } // まだ1回目が終わっていない
        advanceUntilIdle()
        assertEquals(listOf("1回目"), api.created)
    }

    @Test fun `投稿に失敗したら入力欄は残し、理由を見せる`() = runTest(dispatcher) {
        api.error = ApiException(429, "daily_limit", limit = 10)
        val vm = home()
        var cleared = false
        vm.post("こんにちは") { cleared = true }
        advanceUntilIdle()
        assertFalse(cleared)
        assertTrue(vm.state.value.message!!.contains("10回"))
        assertFalse(vm.state.value.sending)
        vm.consumeMessage()
        assertNull(vm.state.value.message)
    }

    @Test fun `既読にすると未読数が0になり、通知もすべて既読表示になる`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        vm.markAllRead()
        advanceUntilIdle()
        assertEquals(1, api.markReadCalls)
        assertEquals(0, vm.state.value.unreadCount)
        assertTrue(vm.state.value.notifications.all { it.read })
        vm.markAllRead() // 未読が無ければ呼ばない
        advanceUntilIdle()
        assertEquals(1, api.markReadCalls)
    }

    @Test fun `既読にできなくてもアプリは壊れない`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        api.error = IOException("down")
        vm.markAllRead()
        advanceUntilIdle()
        assertEquals(17, vm.state.value.unreadCount) // そのまま。次の取得でやり直せる
    }

    @Test fun `データ削除はサーバーに削除を依頼してからログアウトする`() = runTest(dispatcher) {
        home().deleteAccount()
        advanceUntilIdle()
        assertEquals(1, api.deleteCalls)
        assertNull(store.state.value.token)
    }

    @Test fun `データ削除に失敗したらログアウトしない(消えていないのに消えたと思わせない)`() = runTest(dispatcher) {
        api.error = IOException("down")
        val vm = home()
        vm.deleteAccount()
        advanceUntilIdle()
        assertNotNull(store.state.value.token)
        assertNotNull(vm.state.value.message)
    }

    @Test fun `接続先の変更は保存され、再取得する`() = runTest(dispatcher) {
        val vm = home()
        vm.updateServerUrl("  http://192.168.1.10:8787 ")
        advanceUntilIdle()
        assertEquals("http://192.168.1.10:8787", store.state.value.serverUrl)
        assertTrue(vm.state.value.loaded)
    }

    // ---------- いいね・スレッド ----------
    private fun replyReaction(vm: HomeViewModel) = vm.state.value.posts.flatMap { it.reactions }.first { it.isReply && !it.liked }
    private fun reactionNow(vm: HomeViewModel, id: String) = vm.state.value.posts.flatMap { it.reactions }.first { it.id == id }

    @Test fun `いいねは、サーバーの返事を待たずに画面に反映され、もう一度押すと取り消せる`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val r = replyReaction(vm)
        vm.toggleLike(r)
        assertTrue(reactionNow(vm, r.id).liked) // すぐ反映(まだサーバーに届く前)
        advanceUntilIdle()
        assertEquals(listOf(r.id to true), api.likeCalls)
        vm.toggleLike(reactionNow(vm, r.id))
        assertFalse(reactionNow(vm, r.id).liked)
        advanceUntilIdle()
        assertEquals(listOf(r.id to true, r.id to false), api.likeCalls)
    }

    @Test fun `いいねに失敗したら元に戻し、理由を見せる`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val r = replyReaction(vm)
        api.error = IOException("down")
        vm.toggleLike(r)
        advanceUntilIdle()
        assertFalse(reactionNow(vm, r.id).liked) // 押す前の状態に戻っている
        assertNotNull(vm.state.value.message)
    }

    @Test fun `スレッドに発言すると送信され、入力欄を空にして再取得する`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val r = replyReaction(vm)
        var cleared = false
        vm.sendThreadMessage(r, "  こんにちは  ") { cleared = true }
        advanceUntilIdle()
        assertEquals(listOf(r.id to "こんにちは"), api.threadSent)
        assertTrue(cleared)
        assertFalse(vm.state.value.threadSending)
    }

    @Test fun `返事を待っている間・空・長すぎる発言は送らない`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val r = replyReaction(vm)
        vm.sendThreadMessage(r.copy(replying = true), "こんにちは") { }
        vm.sendThreadMessage(r, "  ") { }
        vm.sendThreadMessage(r, "あ".repeat(141)) { }
        advanceUntilIdle()
        assertTrue(api.threadSent.isEmpty())
    }

    @Test fun `スレッドへの送信に失敗したら入力欄は残し、理由を見せる`() = runTest(dispatcher) {
        val vm = home()
        vm.refresh()
        val r = replyReaction(vm)
        api.error = ApiException(409, "reply_pending")
        var cleared = false
        vm.sendThreadMessage(r, "こんにちは") { cleared = true }
        advanceUntilIdle()
        assertFalse(cleared)
        assertTrue(vm.state.value.message!!.contains("返事を待っています"))
        assertFalse(vm.state.value.threadSending)
    }

    // ---------- AuthViewModel ----------
    @Test fun `登録で招待コードが空ならサーバーに送らずに案内する`() = runTest(dispatcher) {
        store = FakeSessionStore(SessionState(loaded = true))
        val vm = AuthViewModel(api, store)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.error!!.contains("招待コード"))
        assertTrue(api.registerCalls.isEmpty())
    }

    @Test fun `登録に成功するとトークンが保存される`() = runTest(dispatcher) {
        store = FakeSessionStore(SessionState(loaded = true))
        val vm = AuthViewModel(api, store)
        vm.onInviteCode(" ABCD1234 ")
        vm.onNickname("みつる")
        vm.onServerUrl(" http://192.168.1.10:8787 ")
        vm.submit()
        advanceUntilIdle()
        assertEquals(listOf("ABCD1234" to "みつる"), api.registerCalls)
        assertEquals("tok", store.state.value.token)
        assertEquals("http://192.168.1.10:8787", store.state.value.serverUrl)
        assertFalse(vm.state.value.loading)
    }

    @Test fun `ニックネーム未入力なら送らない(サーバーが既定名を付ける)`() = runTest(dispatcher) {
        store = FakeSessionStore(SessionState(loaded = true))
        val vm = AuthViewModel(api, store)
        vm.onInviteCode("ABCD1234")
        vm.submit()
        advanceUntilIdle()
        assertEquals(listOf("ABCD1234" to null), api.registerCalls)
    }

    @Test fun `登録に失敗したら理由を見せ、トークンは保存しない`() = runTest(dispatcher) {
        store = FakeSessionStore(SessionState(loaded = true))
        api.error = ApiException(403, "invalid_invite")
        val vm = AuthViewModel(api, store)
        vm.onInviteCode("NOPE")
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.error!!.contains("招待コード"))
        assertNull(store.state.value.token)
        assertFalse(vm.state.value.loading)
    }
}
