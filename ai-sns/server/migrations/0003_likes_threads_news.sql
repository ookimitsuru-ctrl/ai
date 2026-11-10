-- M5: ユーザーからフォロワーへのいいね、スレッド(返信への返信)、ニュース見出しのキャッシュ。

-- ユーザーが、フォロワーの返信(reactions)に付けたいいね
CREATE TABLE reaction_likes (
  user_id     TEXT NOT NULL REFERENCES users(id),
  reaction_id TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, reaction_id)
);

-- スレッド: フォロワーの返信(reactions の reply)に対する、ユーザーとそのフォロワーのやりとり。
--   role: 'user'(ユーザーの発言)/ 'persona'(フォロワーの返事)
--   status: ユーザーの発言は、フォロワーの返事ができるまで 'processing'、できたら 'done'(personaの発言は常に 'done')
CREATE TABLE thread_messages (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  reaction_id        TEXT NOT NULL,          -- スレッドの根っこになる返信(reactions.id)
  role               TEXT NOT NULL CHECK (role IN ('user', 'persona')),
  persona_id         TEXT NOT NULL,
  text               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'done',
  process_started_at INTEGER,
  visible_at         INTEGER NOT NULL,
  created_at         INTEGER NOT NULL
);
CREATE INDEX idx_thread_user_reaction ON thread_messages(user_id, reaction_id, created_at);
CREATE INDEX idx_thread_processing ON thread_messages(status, process_started_at);

-- ニュース見出しのキャッシュ(全ユーザー共通。ユーザーのデータは含まない)
CREATE TABLE news_items (
  tag        TEXT NOT NULL,
  title      TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (tag, title)
);
CREATE TABLE news_tags (
  tag        TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL                -- 最後に取りに行った時刻(失敗したときは少し後に再挑戦できる値にする)
);

-- 「調べもの」の結果キャッシュ(全ユーザー共通。ユーザーのデータは含まない)。話題タグごとに1行
CREATE TABLE lookup_cache (
  tag        TEXT PRIMARY KEY,
  items      TEXT NOT NULL,                  -- JSON 配列(例: ["ゲーム名", ...])
  fetched_at INTEGER NOT NULL
);
