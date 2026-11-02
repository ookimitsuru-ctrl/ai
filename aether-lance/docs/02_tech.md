# 02. 技術仕様・アーキテクチャ

## 1. 動作環境

| 区分 | 対象 |
|---|---|
| PCブラウザ | Chrome / Edge 最新2版、Firefox 最新2版、Safari 16.4以降 |
| モバイル | iOS Safari 16.4以降（iPhone 12以降を基準機）、Android Chrome 最新版（Snapdragon 7系相当を基準機） |
| 性能目標 | 基準機で**60fps安定**（敵弾600発、パーティクル2000個、ポストエフェクトONの状態で）。PC最低ライン Intel UHD 620 内蔵GPUでも60fps |
| 入力遅延 | 入力から描画までの遅延を **2フレーム以内**（33ms）にする。入力のポーリングは毎ロジックフレームの先頭で行う |
| 必須API | Canvas2D、requestAnimationFrame、WebAudio、localStorage、Pointer Events、Gamepad API |
| 任意API | WebGL2（ない場合はCanvas2Dのみで描画）、Fullscreen API、Screen Orientation API、Vibration API、Service Worker |

## 2. 技術スタック

| 分類 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript 5.x（`strict: true`、`noUncheckedIndexedAccess: true`） | 型でデータ定義の誤りを防ぐ |
| ビルド | Vite 5.x | 高速なHMRと静的ビルド |
| ランタイム依存 | **なし**（フレームワーク不使用） | サイズと起動速度、決定性の完全な制御 |
| 開発依存 | vitest、@playwright/test、eslint、prettier、vite-plugin-singlefile、vite-plugin-pwa［SHOULD］ | テスト、整形、単一HTMLビルド、PWA |
| 描画 | Canvas2D（ゲーム画面 480×270）→ WebGL2（ポストプロセスと拡大表示）。WebGL2がなければCanvas2Dで拡大のみ | ピクセルアートを簡単に描けるうえ、光の演出も両立できる |
| 音 | WebAudio API（自作のシンセとシーケンサ） | 音声ファイル不要、BGMとの同期を制御できる |

## 3. ディレクトリ構成

```
aether-lance/
├─ docs/                    … 本指示書
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts / vite.single.config.ts
├─ public/                  … manifest.webmanifest、アイコン（ビルド時にコードから生成してもよい）
├─ src/
│  ├─ main.ts               … エントリ。Bootシーンを起動
│  ├─ core/                 … エンジン層（ゲーム内容に依存しない）
│  │  ├─ loop.ts            … 固定タイムステップのループ
│  │  ├─ input/             … keyboard.ts, gamepad.ts, touch.ts, actions.ts（アクション写像）
│  │  ├─ render/            … canvas.ts, atlas.ts, sprite.ts, font.ts, post/（WebGL2シェーダ）
│  │  ├─ audio/             … engine.ts, synth.ts, instruments.ts, mml.ts, sequencer.ts, sfx.ts
│  │  ├─ math/              … dmath.ts（決定的三角関数）, vec.ts, rng.ts, ease.ts
│  │  ├─ pool.ts            … オブジェクトプール
│  │  ├─ scene.ts           … シーンスタック
│  │  ├─ coroutine.ts       … ジェネレータによるスクリプト実行
│  │  ├─ storage.ts         … localStorage ラッパ（バージョン移行つき）
│  │  └─ i18n.ts
│  ├─ game/                 … ゲーム層
│  │  ├─ world.ts           … 全エンティティの保持、更新順序
│  │  ├─ player.ts, drone.ts, weapons.ts, subweapons.ts, drive.ts
│  │  ├─ enemy.ts, bullet.ts, item.ts, particle.ts, terrain.ts, camera.ts
│  │  ├─ collision.ts, score.ts, rank.ts, timeline.ts, hud.ts
│  │  ├─ patterns.ts        … 弾幕パターンライブラリ
│  │  └─ fx.ts              … 爆発・揺れ・ヒットストップ・フラッシュ
│  ├─ content/              … データ（本書 04〜06、08 の内容を実装したもの）
│  │  ├─ enemies/           … 敵ごとに1ファイル（定義 + 行動スクリプト）
│  │  ├─ bosses/            … ボスごとに1ファイル
│  │  ├─ stages/            … stage1.ts 〜 stage6.ts
│  │  ├─ sprites/           … ピクセル文字列によるスプライト定義
│  │  ├─ backgrounds/       … 背景の生成関数
│  │  ├─ music/             … 曲ごとのMML
│  │  └─ sfx.ts             … SEのパラメータ
│  ├─ data/
│  │  ├─ balance.ts         … 調整用の数値すべて
│  │  └─ palette.ts
│  ├─ scenes/               … boot, title, menu, options, keyconfig, game, pause, stageclear, gameover, nameentry, ranking, ending, credits, practice
│  ├─ ui/                   … ui描画（オーバーレイcanvas）、widgets
│  ├─ i18n/                 … ja.ts, en.ts
│  └─ debug/                … デバッグオーバーレイ、コマンド（本番ビルドでは除去）
└─ tests/
   ├─ unit/                 … vitest
   └─ e2e/                  … playwright
```

## 4. ゲームループ

### 4.1 固定タイムステップ

```ts
const STEP = 1000 / 60;          // 16.666ms
let acc = 0, last = performance.now();
function frame(now: number) {
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;          // タブ復帰時などの暴走を防ぐ
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) { // 1回の描画で最大5ステップまで追いつく
    input.poll();                  // 1ステップごとに入力スナップショットを確定
    scenes.update();               // ロジック1フレーム
    acc -= STEP; steps++;
  }
  if (steps === 5) acc = 0;        // それでも追いつかなければ捨てる（処理落ちではなくスキップ）
  scenes.render(acc / STEP);       // 補間係数 alpha を渡す
  requestAnimationFrame(frame);
}
```

- **補間描画［SHOULD］:** 動くエンティティは前フレームの座標 `px, py` を保持する。描画時は `lerp(prev, cur, alpha)` を求め、整数に丸めてから描く。オプション「なめらか描画」をOFFにすると、補間せず最新の状態だけを描く。120Hz/144Hzのディスプレイでのカクつきを防ぐための仕組みである。
- **ヒットストップとスローモーション:** ロジックのステップ数は変えない。ワールド内部の `timeScale` で表現する。ヒットストップ中は、ワールドのエンティティ更新をスキップするフレームを作る（入力のサンプリング、音、UIは止めない）。スローは「Nフレームに1回だけ更新」という整数方式で実装し、決定性を保つ。
- **タブの非表示（visibilitychange）:** ゲーム中なら自動でポーズし、AudioContextを `suspend` する。
- **ウィンドウのフォーカス喪失（blur）:** 押下中のキーをすべて離した扱いにする（キーが押しっぱなしになる事故を防ぐ）。

### 4.2 シーン管理

- `SceneStack`。`push / pop / replace`。最上位のシーンだけが update され、`transparent` フラグを持つシーン（ポーズなど）は下のシーンも描画する。
- シーン遷移は黒フェード（アウト20f、イン20f）。フェード中は入力を受け付けない。
- シーン一覧: `Boot`、`Title`、`MainMenu`、`DifficultySelect`、`PracticeSelect`、`Options`、`KeyConfig`、`Game`、`Pause`（透過）、`StageClear`（Gameの子状態でもよい）、`GameOver`、`NameEntry`、`Ranking`、`Ending`、`Credits`、`ErrorScreen`。

### 4.3 ワールドの更新順序（1フレーム）［MUST: この順序を厳守］

1. 入力スナップショットの取得（`held / pressed / released`）
2. タイムラインの処理（このフレームのイベントを実行し、敵の出現、スクロール変更、BGM変更などを行う）
3. カメラとスクロールの更新（地形のスクリーン座標を確定）
4. 自機の更新（移動、境界のクランプ、発射の要求）
5. ドローンの更新（陣形の位置、発射）
6. 自機弾の生成と更新
7. 敵の更新（コルーチンを1ステップ進める → 移動 → 発射の要求）
8. 敵弾の生成と更新
9. アイテムの更新（磁力の処理を含む）
10. 衝突判定（順に: 自機弾→地形、自機弾→敵、敵弾→ドローン（ORBIT時）、敵弾→自機、敵本体→自機、地形→自機、アイテム→自機、かすり判定）
11. 死亡と生成のキューを処理（このフレームで死んだものを除去し、爆発を生成）
12. エフェクトの更新（パーティクル、画面の揺れ、フラッシュ、スコアのポップアップ）
13. スコア、ランク、エクステンド、ドライブゲージの更新
14. 音イベントを確定し、オーディオエンジンへ送る（同じフレームに重複したSEはまとめる）
15. `prevX/prevY` の保存（補間用。各エンティティの更新の冒頭で行ってもよい）

## 5. エンティティ設計

### 5.1 方針

- 本格的なECSは採用しない。**種類ごとの型付きクラスと、オブジェクトプール**で構成する。
- ゲーム中（Gameシーンのupdate/render中）は**ヒープ確保をゼロにする**ことを目標とする。クロージャ、配列リテラル、スプレッド構文、文字列の結合、`Array.prototype.map/filter` をホットパスで使わない。
- プールはエンティティ種別ごとに固定長の配列とし、`active` フラグとフリーリスト（スタック）で管理する。

| プール | 上限 | 溢れたとき |
|---|---|---|
| 自機弾 | 256 | 最古のものを再利用 |
| ドローン弾 | 256 | 同上 |
| サブ武器（ボム、ミサイル） | 64 | 生成を諦める |
| 敵 | 160 | 生成を諦め、デバッグ時は警告を出す |
| 敵弾 | 1024 | 生成を諦める（デザイン上は600を超えないようにする） |
| アイテム | 64 | 最古のスターチップを消す |
| パーティクル | 2048 | 最古のものを再利用 |
| テキストポップアップ | 64 | 最古のものを再利用 |

### 5.2 主要な型（抜粋）

```ts
interface Entity { active: boolean; x: number; y: number; px: number; py: number; vx: number; vy: number; age: number; }
interface Enemy extends Entity {
  def: EnemyDef; hp: number; flash: number; carrier: ItemKind | null;
  formationId: number; script: Generator<number, void, unknown> | null; wait: number;
  parts: EnemyPart[] | null; flags: number; /* ARMORED, GROUND, CEILING, PERSISTENT, NO_FIRE ... */
}
interface Bullet extends Entity { kind: BulletKind; r: number; angle: number; speed: number; accel: number; turn: number; grazed: boolean; life: number; }
```

全文は [11_appendix.md](11_appendix.md) にある。

### 5.3 コルーチン（敵スクリプト）

- 敵の行動はTypeScriptのジェネレータ関数で書く。`yield n` で n フレーム待機する。
- スクリプトのAPI（`ScriptCtx`）:

| API | 動作 |
|---|---|
| `wait(n)` | nフレーム待つ（`yield n` の別名） |
| `moveTo(x, y, frames, ease)` | 指定したフレーム数で目標座標へ移動する。ease は `linear / inQuad / outQuad / inOutSine / outBack` |
| `moveBy(dx, dy, frames, ease)` | 相対移動 |
| `setVel(vx, vy)` / `setPolar(angle, speed)` | 速度を設定する |
| `accel(ax, ay)` | 加速度を設定する |
| `aimAngle()` | 自機への角度を返す（決定的な atan2 を使う） |
| `fire(pattern, params)` | 弾幕パターンを発射する（→04 §4）。発射位置は敵の `muzzle` オフセット |
| `telegraph(kind, params, frames)` | 予告表示（線、円、点滅）を出す |
| `sfx(id)` | SEを鳴らす |
| `spawn(enemyId, x, y, opts)` | 子の敵を生成する |
| `whileAlive(partId)` | 指定パーツが生きている間ループするための条件 |
| `parallel(...gens)` | 複数のサブスクリプトを並行して実行する（ボス用） |
| `onBeat(n)` | 次の n 拍目まで待つ（ステージ6のビート同期用 →08 §6） |

```ts
// 例: 画面右から入り、停止して自機を狙い撃ち、上方向へ退場する
export function* dartAmbush(e: Enemy, c: ScriptCtx) {
  yield* c.moveTo(380, e.y, 40, 'outQuad');
  yield 20;
  c.fire('aimed', { speed: 2.2 });
  yield 30;
  c.setPolar(-150, 2.5);
}
```

## 6. 座標、カメラ、スクロール

- 画面サイズは 480×270。プレイフィールドは画面全体で、HUDは上下に半透明で重ねる。
- **カメラ** はワールド座標上の `camX, camY` を持つ。通常のステージは `camY = 0` で固定し、`camX` をスクロール速度で増やす。
- **スクロールベクトル** `scrollVX, scrollVY`（px/f）はタイムラインで変更でき、指定フレーム数をかけて ease で補間する。ステージ5の縦スクロール区間では `scrollVY ≠ 0` になる。
- **縦カメラ追従［SHOULD］**（ステージ2の分岐区間）: ワールドの高さが画面より高い区間では、自機のy座標に応じて camY を追従させる。デッドゾーンは画面中央±50px、追従速度は差分×0.08/f、最大2px/f。
- 敵、弾、自機はスクリーン座標で管理する（スクロールの影響を受けない）。地形に固定された敵（`GROUND` フラグ）だけは、毎フレーム「アンカーのワールド座標 − カメラ」で位置を決める。
- 画面外のマージン: 敵は画面外64pxまで生存する（`PERSISTENT` 以外）。敵弾は16pxを超えたら消滅させる。

## 7. 衝突判定

### 7.1 形状

| 対象 | 形状 | 値 |
|---|---|---|
| 自機（弾・敵に対する判定） | 円 | 半径 2.0px。中心はスプライト中心から (+3, 0)（コクピット） |
| 自機（地形に対する判定） | AABB | 16×6px、スプライト中心基準 |
| 自機（かすり判定） | 円 | 半径 14px |
| 自機（アイテム取得） | 円 | 半径 12px。磁力範囲は半径 40px |
| 敵本体 | AABB または円（敵定義で指定）。パーツは個別の形状を持つ | — |
| 敵弾 | 円（ニードルはカプセル） | 弾種ごとに →04 §3 |
| レーザー | 線分 + 太さ（カプセル） | — |
| 自機弾 | AABB（PULSE、FAN）、カプセル（RAY） | — |

### 7.2 ブロードフェーズ

- 敵は32px格子の一様グリッドに登録する（毎フレーム作り直す。セル配列は使い回す）。自機弾は自分が重なるセルの敵だけを調べる。
- 敵弾と自機の判定は全数を走査する（自機は1体なので O(n) で十分）。

### 7.3 地形との衝突

- 地形は16×16pxのタイルで構成する。タイルごとに16行×16bitの**衝突マスク**（`Uint16Array(16)`）を持たせ、斜面や曲面をピクセル単位で表現する。
- 自機と地形の判定: 地形AABB（16×6）の外周上の12点（各辺3点）と中心の計13点をサンプルし、1点でも固体ならヒットとする。
- 弾と地形の判定: 弾の中心点が固体かどうかで判定する。RAYは先端の点で判定する。
- 地形の法線（バリア時の押し戻しや、反射に使う）: ヒット点の周囲3×3のマスクから勾配を求める。結晶反射用の法線は、タイルに事前計算した値を使う。
- **破壊可能タイル**（ステージ2の結晶壁、ステージ3の肉壁）: タイルごとにHPを持つ。破壊したら衝突マスクを0にし、描画はアニメーションで欠けさせる。再生するタイルは、再生時に自機と重なっていたら待機する。

## 8. 決定性［MUST］

リプレイ、デバッグ、テストの再現性のために、ゲームロジックは完全に決定的にする。

- **乱数:** `mulberry32` などシード付きのPRNGを使う。ストリームを2系統に分ける。
  - `rngGame`: ゲームに影響する乱数（ステージ開始時に `seed = stageIndex * 7919 + loop * 104729` で初期化）
  - `rngFx`: 見た目だけの乱数（パーティクル、揺れ）。ゲームロジックから**絶対に参照しない**
- **三角関数:** `Math.sin / cos / atan2` はエンジンによって結果が異なることがあるので、ゲームロジックでは使わない。四則演算と `Math.sqrt`（IEEE754で結果が保証される）だけで実装した `dsin / dcos / datan2` を `core/math/dmath.ts` に用意する（多項式近似、誤差1e-6以下）。描画やパーティクルでは `Math.*` を使ってよい。
- **時間:** ゲームロジックの中では `performance.now()` や `Date` を参照しない。フレーム数だけを使う。
- **反復順序:** プールの走査順は固定する（配列のインデックス順）。`Map` や `Set` の反復は挿入順なので使ってもよいが、オブジェクトキーの列挙に依存しない。
- **検証:** 入力ログを2回再生し、各ステージ終了時のワールド状態のハッシュ（自機の座標、スコア、敵の数、乱数の状態）が一致することを単体テストで保証する（→10 §3）。

## 9. 入力システム

- **アクション写像:** 物理入力（キー、ボタン、タッチ）を論理アクションに変換する。ゲームのコードは論理アクションだけを参照する。
- 論理アクション: `UP, DOWN, LEFT, RIGHT, SHOT, DRIVE, SPEED_UP, SPEED_DOWN, FORMATION, PAUSE, CONFIRM, CANCEL`、および `SPEED_1〜4`（キーボード専用の直接指定）。
- **短い押下の取りこぼし防止:** keydown/keyup はイベント時点でキューに積み、次のロジックフレームで `pressed` に確定する。同じフレーム内で押して離した場合も `pressed = true` として扱う。
- `KeyboardEvent.code` を使う（キーボードレイアウトに依存させない）。ゲーム中は方向キーやスペースの `preventDefault` を行い、ページのスクロールを防ぐ。
- ゲームパッド: 毎フレーム `navigator.getGamepads()` をポーリングする。Standard Mapping を前提とし、非標準のパッドもキーコンフィグで割り当てられるようにする。
- タッチ: Pointer Events で実装する（→03 §2.3、09 §6）。
- 操作の詳細は [03 §2](03_gameplay.md#2-操作) を参照。

## 10. 描画パイプライン

1. **ゲームcanvas（480×270、オフスクリーン）** にCanvas2Dで描画する。`imageSmoothingEnabled = false`。描画順は 07 §8 のレイヤ表に従う。
2. **発光バッファ（240×135、半解像度）［SHOULD］**: 加算発光が必要なもの（弾のグロー、爆発、レーザー）を別にも描く。WebGLのブルーム入力に使う。
3. **プレゼンテーション:**
   - WebGL2がある場合: ゲームcanvasをテクスチャにアップロードし（`texSubImage2D`）、ブルーム → CRT/歪み → 拡大の順にシェーダを通して表示canvasへ描く（→07 §7）。
   - WebGL2がない場合: 表示canvasに `drawImage` で整数倍に拡大して描く（nearest）。
4. **UIオーバーレイcanvas（実ピクセル解像度）**: 日本語テキスト、タッチボタン、メニューの説明文など、高解像度で描くべきものを描く。ゲーム画面と同じ位置・サイズに重ねる。
5. **スケーリング:** オプションで `INTEGER`（既定。最大の整数倍）、`FIT`（アスペクト比を保って最大化、nearest）、`STRETCH` を選べる。余白は黒にする。`devicePixelRatio` を考慮し、CSSピクセルではなく実ピクセルで整数倍にする。

## 11. 音声

詳細は [08_audio.md](08_audio.md)。要点は次の3つ。

- AudioContext は最初のユーザー操作（クリック、タップ、キー入力）で生成・resumeする。Bootシーンに「CLICK / TAP / PRESS ANY KEY」を表示して、この操作を促す。
- SEはブート時に OfflineAudioContext で AudioBuffer に事前レンダリングする［SHOULD］。BGMはリアルタイムに合成する。
- ゲームロジックからは `audio.play(sfxId, {x})` と `audio.music(songId, opts)` だけを呼ぶ。

## 12. セーブ

- `localStorage` のキーは `aetherlance.save.v1`。書き込みはすべて try/catch で包み、失敗してもゲームは続行する（プライベートモード対策）。
- スキーマとマイグレーションは [09 §8](09_ui.md#8-セーブデータ) を参照。

## 13. エラー処理

- `window.onerror` と `unhandledrejection` を捕捉し、ErrorScreen を表示する。内容は「エラーが発生しました」、エラーの要約、スタックをコピーするボタン、タイトルへ戻るボタン。
- 開発ビルドではコンソールに詳細を出す。本番ビルドでもエラーを握りつぶさない。
- 各ステージのデータはブート時に検証関数（`validateStage`）を通す。未定義の敵IDや範囲外の値があれば、開発時は即座に例外を投げる。

## 14. ビルドと配布

| コマンド | 出力 | 用途 |
|---|---|---|
| `npm run dev` | — | 開発サーバ（HMR） |
| `npm run build` | `dist/`（複数ファイル） | GitHub Pages、PWA |
| `npm run build:single` | `dist-single/aether-lance.html`（JS、CSSをすべてインライン化。目標2MB以下） | ファイル1つで配布できる。claude.ai の Artifact としても公開できる |
| `npm test` | — | vitest |
| `npm run e2e` | — | Playwright |
| `npm run lint` | — | eslint + tsc --noEmit |

- `vite.config.ts` の `base` は `./`（相対パス）にする。サブディレクトリ配信にも、ファイルを直接開く場合にも対応するため。
- GitHub Pages: `.github/workflows/deploy-aether-lance.yml` を追加する。`aether-lance/**` への push で build し、`actions/deploy-pages` で公開する［SHOULD］。（既存の `build-apk.yml` には触れない。）
- PWA［SHOULD］: manifest（`display: fullscreen`、`orientation: landscape`、テーマ色 `#0b0d17`）、アイコン（192/512。ケストレルのシルエット）、Service Worker（全ファイルをプリキャッシュし、オフラインで動作させる）。iPhoneではFullscreen APIが使えないため、ホーム画面への追加（standalone）でフルスクリーンにする。
- 外部への通信は Google Fonts（DotGothic16）だけにする。フォントの読み込みに失敗しても、ビットマップフォントとシステムフォントにフォールバックして動作させる。単一HTML版では、DotGothic16を使用文字だけサブセット化し、base64のwoff2として埋め込んでもよい［COULD］。

## 15. パフォーマンス予算

| 項目 | 予算（基準機） |
|---|---|
| ロジック1フレーム | 3ms以下（最大負荷のボス戦で5ms以下） |
| 描画1フレーム | 7ms以下（ポストエフェクト込み） |
| GC | ゲーム中にメジャーGCが起きないこと（ヒープの増加量 < 100KB/分） |
| 起動 | ブートからタイトル表示まで1.5秒以内（スプライトのアトラス生成とSEの事前レンダリングを含む） |
| サイズ | JS gzip後で400KB以下 |
| 自動品質調整 | 平均fpsが55を下回る状態が2秒続いたら、①パーティクルの生成数を半分にし、②ブルームを1/8解像度に落とし、③CRTを無効にする（段階的に適用し、回復しても戻さない）。オプションで手動設定もできる |

## 16. コーディング規約

- ESLint の推奨ルール + `@typescript-eslint/recommended-type-checked`。`any` は禁止（境界部では `unknown` と型ガードを使う）。
- ゲームの数値はすべて `balance.ts` や各コンテンツの定義に置く。
- 1ファイル600行以内を目安にする（ボススクリプトは例外として1000行まで認める）。
- 状態は `World` が所有する。グローバルな可変状態を作らない（シングルトンは audio、input、storage だけ）。
- コミットはマイルストーンのタスク単位で行い、メッセージは英語の命令形にする。
