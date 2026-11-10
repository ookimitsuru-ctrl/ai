package com.hitorigoto.app

import com.hitorigoto.app.data.ApiException
import com.hitorigoto.app.data.HttpSnsApi
import com.hitorigoto.app.data.SessionState
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

class HttpSnsApiTest {
    private lateinit var server: MockWebServer
    private lateinit var store: FakeSessionStore
    private lateinit var api: HttpSnsApi

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        store = FakeSessionStore(SessionState(loaded = true, serverUrl = server.url("/").toString().trimEnd('/'), token = "tok-123", nickname = "みつる"))
        api = HttpSnsApi(store)
    }

    @After fun tearDown() = server.shutdown()

    private fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("content-type", "application/json").setBody(body)

    @Test fun `ログイン後の呼び出しには Bearer トークンが付き、本物のJSONを読める`() = runTest {
        server.enqueue(json(fixture("posts.json")))
        val posts = api.posts(limit = 5)
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/v1/posts?limit=5", req.path)
        assertEquals("Bearer tok-123", req.getHeader("authorization"))
        assertEquals(6, posts.size)
    }

    @Test fun `登録にはトークンを付けず、招待コードとニックネームを送る`() = runTest {
        store.logout()
        server.enqueue(json(fixture("register.json"), 201))
        val r = api.register("ABCD1234", "みつる")
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/v1/auth/register", req.path)
        assertNull(req.getHeader("authorization"))
        assertTrue(req.body.readUtf8().let { it.contains("\"inviteCode\":\"ABCD1234\"") && it.contains("\"nickname\":\"みつる\"") })
        assertEquals("みつる", r.nickname)
    }

    @Test fun `ニックネームが空なら送らない`() = runTest {
        store.logout()
        server.enqueue(json(fixture("register.json"), 201))
        api.register("ABCD1234", "  ")
        assertTrue(!server.takeRequest().body.readUtf8().contains("nickname"))
    }

    @Test fun `つぶやきの投稿`() = runTest {
        server.enqueue(json(fixture("post_created.json"), 201))
        val p = api.createPost("こんにちは")
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/v1/posts", req.path)
        assertEquals("""{"body":"こんにちは"}""", req.body.readUtf8())
        assertTrue(p.id.isNotEmpty())
    }

    @Test fun `通知の取得と既読`() = runTest {
        server.enqueue(json(fixture("notifications.json")))
        assertEquals(19, api.notifications(50).unreadCount)
        assertEquals("/v1/notifications?limit=50", server.takeRequest().path)

        server.enqueue(json(fixture("read.json")))
        assertEquals(0, api.markAllRead())
        val req = server.takeRequest()
        assertEquals("/v1/notifications/read", req.path)
        assertEquals("""{"all":true}""", req.body.readUtf8())
    }

    @Test fun `データ削除は DELETE で、本文のない204でも成功する`() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))
        api.deleteMe()
        val req = server.takeRequest()
        assertEquals("DELETE", req.method)
        assertEquals("/v1/me", req.path)
    }

    @Test fun `サーバーのエラーは ApiException(コード付き)になる`() = runTest {
        server.enqueue(json(fixture("error_invalid_invite.json"), 403))
        val e = runCatching { api.register("NOPE", null) }.exceptionOrNull() as ApiException
        assertEquals(403, e.status)
        assertEquals("invalid_invite", e.code)

        server.enqueue(json("""{"error":"daily_limit","limit":10}""", 429))
        val e2 = runCatching { api.createPost("x") }.exceptionOrNull() as ApiException
        assertEquals(10, e2.limit)

        server.enqueue(json("""{"error":"unauthorized"}""", 401))
        assertTrue((runCatching { api.me() }.exceptionOrNull() as ApiException).isUnauthorized)
    }

    @Test fun `本文がJSONでないエラーでも ApiException`() = runTest {
        server.enqueue(MockResponse().setResponseCode(502).setBody("<html>Bad Gateway</html>"))
        val e = runCatching { api.me() }.exceptionOrNull() as ApiException
        assertEquals(502, e.status)
        assertNull(e.code)
    }

    @Test fun `接続先が止まっている・未設定のときは IOException`() = runTest {
        server.shutdown()
        assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { api.me() } }
        store.setServerUrl("  ")
        assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { api.me() } }
    }

    @Test fun `トークンが無いのに認証が要る呼び出しをしたら401扱い`() = runTest {
        store.logout()
        val e = runCatching { api.me() }.exceptionOrNull() as ApiException
        assertTrue(e.isUnauthorized)
    }

    @Test fun `接続先URLの末尾のスラッシュは無視する`() = runTest {
        store.setServerUrl(server.url("/").toString()) // 末尾に / が付いたまま
        server.enqueue(json(fixture("me.json")))
        api.me()
        assertEquals("/v1/me", server.takeRequest().path)
    }
}
