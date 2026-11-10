# ひとりごと サーバー (M1〜M3)

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
| **LLM差し替え層**(`mock` / `local` / `anthropic`) | `src/llm/`(`LLM_PROVIDER` で切替) |
| **リアクション(いいね・返信)の判定と生成** | `src/reactions.ts`、`src/llm/prompted.ts` |
| **返信の検証と再生成**(一人称・絵文字・長さ・キャラ崩れ・他ユーザー言及) | `src/llm/verify.ts` |
| **LLMを手元で試すスクリプト**(サーバー不要) | `npm run try-llm` |
| キーワード話題解析(LLM障害時の縮退運転にも使う) | `src/topics.ts` |
| DBスキーマ | `migrations/0001_init.sql` |

まだ無いもの: 通知の取得API・フォローの時間差表示(M4)、ユーザーの返信への返信(スレッド会話)。
**未確認: 実機のモデル(ローカルLLM / Haiku)での口調の品質。** コードとテストは完了しているが、実モデルでの確認は `npm run try-llm` でこれから行う。

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

## LLM の切り替え

`.dev.vars`(ローカル)または `wrangler secret`(本番)で設定する。設定ミス・通信エラー・安全判定での拒否があっても投稿は成功し、セリフ例で代用する。

```sh
# モック(既定。AI不使用・無料・結果が毎回同じ)
LLM_PROVIDER=mock

# ローカルLLM: OpenAI互換API(/v1/chat/completions)を話すサーバーなら何でも
LLM_PROVIDER=local
LLM_BASE_URL=http://localhost:11434/v1      # Ollama の例。LM Studio は http://localhost:1234/v1 など
LLM_MODEL=<サーバーに登録されているモデル名>
# 思考(<think>)をするモデルは、思考をオフにすると速く安定する。サーバーにより書き方が違う例:
# LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}
# LLM_TIMEOUT_MS=120000

# Claude Haiku 5.5
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### 手元のLLMが実用になるか試す(サーバー不要)

```sh
LLM_PROVIDER=local LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=<モデル名> \
  npm run try-llm -- "朝ランで10km走ってきた!" --new=kenji_run
```

話題解析と、話題に合う上位5人の返信を出し、秒数と「1回目で基準を満たした数 / 再生成が必要だった数 / セリフ例で代用した数」を表示する。
口調がキャラらしいか(語尾・一人称・長さ・キャラ同士の違い)は、出力を見て判断する。
`--personas=kenji_run,miyu_cafe` で返信する人を指定できる。

> 注意: 現状 `POST /v1/posts` は返信の生成が終わるまで待つ。ローカルLLMが遅い場合は `LLM_TIMEOUT_MS` と、アプリ側の待ち時間に注意(M4 で非同期化を検討)。

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
- 投稿APIは内部値(親和度・確率)を返さない。
- 返信生成に渡す「直近のやりとり」は、そのユーザー自身のものだけ(`src/targets.ts`、テストで確認済み)。`relations` を消すのはアカウント削除時のみ。

## 本番デプロイ前にやること

1. `wrangler d1 create hitorigoto` で発行した ID を `wrangler.toml` の `database_id` に入れる
2. `wrangler secret put TOKEN_SECRET` / `wrangler secret put ADMIN_KEY`
3. `wrangler d1 migrations apply hitorigoto --remote`
