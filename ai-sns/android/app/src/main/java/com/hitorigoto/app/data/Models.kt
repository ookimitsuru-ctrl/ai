package com.hitorigoto.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** サーバー(ai-sns/server)のAPIレスポンス。知らないフィールドは無視する(サーバーが先に進んでも壊れない) */
val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    isLenient = true
}

@Serializable
data class RegisterResponse(val userId: String, val token: String, val nickname: String)

@Serializable
data class Me(val userId: String, val nickname: String, val createdAt: Long, val followerCount: Int)

/**
 * フォロワー20枠の1つ。locked=true のときは slot 以外は入っていない(まだ出会っていない人)。
 */
@Serializable
data class PersonaSlot(
    val slot: Int,
    val locked: Boolean,
    val id: String? = null,
    val name: String? = null,
    val handle: String? = null,
    val age: Int? = null,
    val occupation: String? = null,
    val bio: String? = null,
    val personality: List<String> = emptyList(),
    val favoriteTopics: List<String> = emptyList(),
    val followedAt: Long? = null,
)

@Serializable
data class PersonasResponse(val personas: List<PersonaSlot>)

@Serializable
data class ReactionPersona(val id: String, val name: String, val handle: String)

@Serializable
data class Reaction(
    val id: String,
    /** "reply" or "like" */
    val type: String,
    val text: String? = null,
    val visibleAt: Long,
    val persona: ReactionPersona,
) {
    val isReply get() = type == "reply" && !text.isNullOrBlank()
    val isLike get() = type == "like"
}

@Serializable
data class TopicView(val tag: String, val label: String, val weight: Double)

@Serializable
data class PostView(
    val id: String,
    val body: String,
    val createdAt: Long,
    /** "processing"(フォロワーが読んでいる最中)or "done" */
    val status: String,
    val topics: List<TopicView> = emptyList(),
    val reactions: List<Reaction> = emptyList(),
) {
    val isProcessing get() = status == "processing"
    val replies get() = reactions.filter { it.isReply }
    val likes get() = reactions.filter { it.isLike }
}

@Serializable
data class PostsResponse(val posts: List<PostView>)

@Serializable
data class CreatedPost(val id: String, val body: String, val createdAt: Long)

@Serializable
data class CreatePostResponse(val post: CreatedPost)

@Serializable
data class NotificationView(
    val id: String,
    /** "follow" / "like" / "reply" */
    val type: String,
    val createdAt: Long,
    val read: Boolean,
    val persona: ReactionPersona,
    val postId: String? = null,
    val text: String? = null,
)

@Serializable
data class NotificationsResponse(val notifications: List<NotificationView>, val unreadCount: Int)

@Serializable
data class UnreadResponse(val unreadCount: Int)

@Serializable
data class ErrorBody(val error: String? = null, val limit: Int? = null, val max: Int? = null)
