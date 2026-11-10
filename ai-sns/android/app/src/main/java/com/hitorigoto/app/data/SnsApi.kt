package com.hitorigoto.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** サーバーがエラーを返したとき。code はサーバーの error 文字列(例: invalid_invite, daily_limit) */
class ApiException(val status: Int, val code: String?, val limit: Int? = null, val max: Int? = null) :
    IOException("HTTP $status ${code ?: ""}") {
    val isUnauthorized get() = status == 401
}

interface SnsApi {
    suspend fun register(inviteCode: String, nickname: String?): RegisterResponse
    suspend fun me(): Me
    suspend fun deleteMe()
    suspend fun personas(): List<PersonaSlot>
    suspend fun createPost(body: String): CreatedPost
    suspend fun posts(limit: Int = 20): List<PostView>
    suspend fun notifications(limit: Int = 50): NotificationsResponse
    suspend fun markAllRead(): Int
}

/** OkHttp で ai-sns サーバーに話す実装。接続先とトークンは、呼び出しのたびに SessionStore から読む */
class HttpSnsApi(
    private val session: SessionStore,
    private val client: OkHttpClient = defaultClient(),
) : SnsApi {

    override suspend fun register(inviteCode: String, nickname: String?): RegisterResponse {
        val body = buildJsonObject {
            put("inviteCode", inviteCode)
            if (!nickname.isNullOrBlank()) put("nickname", nickname)
        }
        return call("POST", "/v1/auth/register", AppJson.encodeToString(body), auth = false)
    }

    override suspend fun me(): Me = call("GET", "/v1/me")

    override suspend fun deleteMe() {
        callRaw("DELETE", "/v1/me", null, auth = true)
    }

    override suspend fun personas(): List<PersonaSlot> = call<PersonasResponse>("GET", "/v1/personas").personas

    override suspend fun createPost(body: String): CreatedPost {
        val json = AppJson.encodeToString(buildJsonObject { put("body", body) })
        return call<CreatePostResponse>("POST", "/v1/posts", json).post
    }

    override suspend fun posts(limit: Int): List<PostView> = call<PostsResponse>("GET", "/v1/posts?limit=$limit").posts

    override suspend fun notifications(limit: Int): NotificationsResponse = call("GET", "/v1/notifications?limit=$limit")

    override suspend fun markAllRead(): Int {
        val json = AppJson.encodeToString(buildJsonObject { put("all", true) })
        return call<UnreadResponse>("POST", "/v1/notifications/read", json).unreadCount
    }

    private suspend inline fun <reified T> call(method: String, path: String, json: String? = null, auth: Boolean = true): T {
        val text = callRaw(method, path, json, auth)
        return AppJson.decodeFromString(text)
    }

    private suspend fun callRaw(method: String, path: String, json: String?, auth: Boolean): String =
        withContext(Dispatchers.IO) {
            val state = session.state.value
            val base = state.serverUrl.trim().trimEnd('/')
            if (base.isEmpty()) throw IOException("サーバーのURLが設定されていません")
            val builder = Request.Builder().url("$base$path")
            if (auth) {
                val token = state.token ?: throw ApiException(401, "unauthorized")
                builder.header("authorization", "Bearer $token")
            }
            val body = json?.toRequestBody("application/json; charset=utf-8".toMediaType())
            builder.method(method, body ?: if (method == "GET" || method == "DELETE") null else "".toRequestBody())
            client.newCall(builder.build()).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    val err = runCatching { AppJson.decodeFromString<ErrorBody>(text) }.getOrNull()
                    throw ApiException(res.code, err?.error, err?.limit, err?.max)
                }
                text
            }
        }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}
