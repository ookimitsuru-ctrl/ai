# ひとりごと サーバー (M1〜M2)

Cloudflare Workers + D1 (TypeScript / Hono)。仕様は [`../SPEC.md`](../SPEC.md)。

## できていること

| 項目 | 場所 |
|---|---|
| フォロワー20人のマスタ | `data/personas.json` |
| 話題タグ語彙(60タグ+キーワード) | `data/topics.json` |
| マスタの整合性チェック | `src/validate.ts`(テストで常時検証) |
| 招待コード制の匿名登録 | `POST /v1/auth/register`、`POST /admin/invites` |
| 自分の情報・データ削除 | `GET /v1/me`、`DELETE /v1/me` |
| **つぶやき投稿(話題解析→フォロー判定→保存)** | `POST /v1/posts`、`GET /v1/posts` |
| フォロー判定ロジックと調整用パラメータ | `src/follow.ts` |
| フォローの増え方のシミュレーション | `npm run sim`(`scripts/`) |
| 1日の投稿上限(既定10回/24時間) | `DAILY_POST_LIMIT` |
| フォロワー一覧(20枠、未フォローは「???」) | `GET /v1/personas` |
| LLM差し替え層(`mock` のみ実装) | `src/llm/`(`LLM_PROVIDER` で切替) |
| キーワード話題解析(LLM障害時の縮退運転にも使う) | `src/topics.ts` |
| DBスキーマ | `migrations/0001_init.sql` |

まだ無いもの: 返信・いいねの生成(M3)、ollama / anthropic プロバイダ(M3)、通知の取得API・時間差表示(M4)。
現状はフォローとフォロー通知(DBに保存)までで、LLM は使わない(話題解析はキーワード一致)。

## セットアップ

```sh
npm install                 # .npmrc の legacy-peer-deps は npm の依存解決バグ回避用
cp .dev.vars.example .dev.vars   # TOKEN_SECRET / ADMIN_KEY を好きな長い文字列に変える
npm run db:local            # ローカルDBにマイグレーション適用
npm run dev                 # http://localhost:8787
npm test                    # テスト(Workers実行環境で動く)
npm run sim                 # フォローの増え方を確認(AI不使用)。
                            # 例: FOLLOW_CFG='{"pace":0.5}' npm run sim
npm run typecheck
```

## 動作確認(curl)

```sh
# 招待コードを発行
curl -s -X POST localhost:8787/admin/invites -H 'x-admin-key: <ADMIN_KEY>' \
  -H 'content-type: application/json' -d '{"maxUses":1,"note":"自分用"}'

# 登録(返ってくる token をアプリ側で保存する)
curl -s -X POST localhost:8787/v1/auth/register -H 'content-type: application/json' \
  -d '{"inviteCode":"<上のcode>","nickname":"みつる"}'

# つぶやく(話題に合う人が確率でフォローしてくる)
curl -s -X POST localhost:8787/v1/posts -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' -d '{"body":"朝ランで10km走ってきた!"}'

# フォロワー一覧(最初は20枠すべて locked)
curl -s localhost:8787/v1/personas -H 'authorization: Bearer <token>'
```

## 設計上の約束(SPEC §3.6)

- ユーザー固有のテーブルは必ず `user_id` で絞る。ユーザー間をまたぐ参照は作らない。
- `/v1/personas` は `src/personaView.ts` を通した公開情報だけを返す。`interests` / `theta` / `speech` / `samples` などの内部設定と、未フォローのペルソナの名前・IDは返さない(テストで確認済み)。
- フォロー解除の処理は存在しない。
- 投稿APIは内部値(親和度・確率)を返さない。`relations` を消すのはアカウント削除時のみ。

## 本番デプロイ前にやること

1. `wrangler d1 create hitorigoto` で発行した ID を `wrangler.toml` の `database_id` に入れる
2. `wrangler secret put TOKEN_SECRET` / `wrangler secret put ADMIN_KEY`
3. `wrangler d1 migrations apply hitorigoto --remote`
