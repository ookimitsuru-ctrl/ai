# ひとりごと サーバー (M1〜M4)

Cloudflare Workers + D1 (TypeScript / Hono)。仕様は [`../SPEC.md`](../SPEC.md)。

## できていること

| 項目 | 場所 |
|---|---|
| フォロワー20人のマスタ | `data/personas.json` |
| 話題タグ語彙(60タグ+キーワード) | `data/topics.json` |
| マスタの整合性チェック | `src/validate.ts`(テストで常時検証) |
| 招待コード制の匿名登録 | `POST /v1/auth/register`、`POST /admin/invites` |
| 自分の情報・データ削除 | `GET /v1/me`、`DELETE /v1/me` |
| **つぶやき投稿**(即返答。解析・フォロー判定・返信生成は裏で処理) | `POST /v1/posts`、`src/processPost.ts` |
| 自分のつぶやき一覧(処理状況・表示時刻を過ぎたリアクション付き) | `GET /v1/posts` |
| **通知**(新規フォロー・いいね・返信)と既読 | `GET /v1/notifications`、`POST /v1/notifications/read` |
| 止まった投稿の自動救済(AIなしの縮退運転) | `recoverStuckPosts`(一覧・通知の読み出し時に実行) |
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

まだ無いもの: プッシュ通知(FCM)、ユーザーの返信への返信(スレッド会話)、Androidアプリ本体。
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

### 動作確認済みの組み合わせ

| 環境 | 設定 | 結果 |
|---|---|---|
| Mac mini M5 Pro 48GB + kapitsa + `qwen3.8-27b:8bit`(思考オフ) | `LLM_BASE_URL=http://localhost:8000/v1`、`LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}` | 話題解析 4.7秒、返信1人分 7.4秒。ケンジの口調(「っす」「俺」)が出て、検証も1回目で合格 |

kapitsa は OpenAI 互換(`/v1/models`、`/v1/chat/completions`)。思考をオフにしないと話題解析だけで長くかかる。

### 手元のLLMが実用になるか試す(サーバー不要)

```sh
LLM_PROVIDER=local LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=<モデル名> \
  npm run try-llm -- "朝ランで10km走ってきた!" --new=kenji_run
```

話題解析と、話題に合う上位5人の返信を出し、秒数と「1回目で基準を満たした数 / 再生成が必要だった数 / セリフ例で代用した数」を表示する。
口調がキャラらしいか(語尾・一人称・長さ・キャラ同士の違い)は、出力を見て判断する。
`--personas=kenji_run,miyu_cafe` で返信する人を指定できる。

> `POST /v1/posts` は保存してすぐ返る(約15ms)。解析と返信の生成は裏で行い、結果はリアクション・通知の表示時刻(10秒〜最大3分後)になったものから見える。`REPLY_MODE=sync` にすると、デバッグ用に完了まで待つ。

## API 一覧

すべて `Authorization: Bearer <token>` が必要(登録を除く)。

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/v1/auth/register` | `{inviteCode, nickname?}` → `{userId, token}` |
| GET / DELETE | `/v1/me` | 自分の情報(表示中のフォロワー数)/ 全データ削除 |
| GET | `/v1/personas` | 20枠(未フォローは `{slot, locked:true}`)。表示時刻を過ぎたフォロワーだけ解放 |
| POST | `/v1/posts` | `{body}`(140字以内)→ `{post:{id, body, createdAt}}` |
| GET | `/v1/posts?limit=&before=` | つぶやき一覧。`status`(`processing`/`done`)、`topics`、表示時刻を過ぎた `reactions` |
| GET | `/v1/notifications?limit=&before=` | `{notifications:[{id, type: follow/like/reply, createdAt, read, persona, postId?, text?}], unreadCount}` |
| POST | `/v1/notifications/read` | `{ids:[…]}`(最大100)または `{all:true}` → `{unreadCount}` |
| POST | `/admin/invites` | `x-admin-key` ヘッダが必要。招待コードの発行 |

アプリは、投稿後に `GET /v1/posts` と `GET /v1/notifications` を一定間隔で取りに行く(プッシュ通知を入れるまでの間)。

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
- 通知・リアクション・フォローは、表示時刻を過ぎたものだけがAPIに出る。他ユーザーの通知は見えず、既読にもできない(テストで確認済み)。
- 返信生成に渡す「直近のやりとり」は、そのユーザー自身のものだけ(`src/targets.ts`、テストで確認済み)。`relations` を消すのはアカウント削除時のみ。

## 本番デプロイ前にやること

1. `wrangler d1 create hitorigoto` で発行した ID を `wrangler.toml` の `database_id` に入れる
2. `wrangler secret put TOKEN_SECRET` / `wrangler secret put ADMIN_KEY`
3. `wrangler d1 migrations apply hitorigoto --remote`
