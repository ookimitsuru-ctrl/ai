-- ひとりごと: 初期スキーマ (SPEC.md §6)
-- すべてのユーザー固有テーブルは user_id で絞って使う(ユーザー間をまたぐ参照は作らない)。

CREATE TABLE users (
  id          TEXT PRIMARY KEY,            -- 乱数ID(匿名)
  nickname    TEXT NOT NULL,
  invite_code TEXT,                        -- 登録時に使った招待コード
  created_at  INTEGER NOT NULL             -- epoch ms
);

CREATE TABLE invites (
  code        TEXT PRIMARY KEY,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  used_count  INTEGER NOT NULL DEFAULT 0,
  disabled    INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE posts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  topics     TEXT,                         -- JSON [{tag, weight}]
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_user ON posts(user_id, created_at DESC);

-- ユーザー × ペルソナの関係。「誰が誰をフォローしているか」の唯一の正。
-- フォロワーは外れない仕様のため、このテーブルを削除する処理はアカウント削除時のみ。
CREATE TABLE relations (
  user_id          TEXT NOT NULL REFERENCES users(id),
  persona_id       TEXT NOT NULL,          -- data/personas.json の id
  followed_at      INTEGER NOT NULL,
  trigger_post_id  TEXT,
  affinity_at_follow REAL,
  intimacy         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, persona_id)
);

CREATE TABLE reactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  post_id    TEXT NOT NULL REFERENCES posts(id),
  persona_id TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('like', 'reply')),
  text       TEXT,
  visible_at INTEGER NOT NULL,             -- これを過ぎたら表示(時間差演出)
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reactions_user ON reactions(user_id, visible_at);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,                -- follow | like | reply
  ref_id     TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  visible_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, visible_at);
