-- 投稿の非同期処理(M4)。
-- 投稿はすぐ保存して返し、話題解析・フォロー判定・返信生成は裏で行う。
--   status: 'processing'(処理中)→ 'done'(完了)
--   process_started_at: 処理を始めた時刻。一定時間たっても done にならない投稿は、読み出し時に検知して救済する。
-- 既存の投稿は処理済みなので、既定値は 'done'。
ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE posts ADD COLUMN process_started_at INTEGER;
CREATE INDEX idx_posts_processing ON posts(status, process_started_at);
