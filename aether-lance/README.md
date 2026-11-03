# AETHER LANCE（エーテルランス）

ブラウザで遊ぶ、オリジナルの横スクロールシューティングです。地形との駆け引き、パワーアップで自機を育てる楽しさ、覚えて上達する快感、そして画面を埋める巨大ボスが軸になっています。

- 全6ステージ。各ステージに中ボスとボスがいて、ステージ6のあとに2周目があります。
- グラフィック・BGM・効果音は、すべてコードで生成しています。画像ファイルや音声ファイルは使っていません。
- PC（キーボード／ゲームパッド）とスマートフォン（タッチ）の両方で遊べます。Android 用の APK もあります。
- **2つの版があります。** ドット絵の「通常版」と、同じゲームを現代的な高解像度グラフィックで描き直した「HD 版」です（下記「HD 版について」）。
- 設計書は [`docs/`](docs/README.md) にあります。実装上の補足は [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md) にまとめました。
- **v1.1 の変更:** 自機を新デザイン（KESTREL Mk.II）に変更、敵が途切れず出てくるように「つなぎ編隊」を追加、ボスと中ボスを倒しやすく調整（攻撃はそのまま）、RAY が敵に当たらなかった不具合を修正。詳しくは [`docs/12_implementation.md`](docs/12_implementation.md) の §3。

---

## 1. 遊び始める

### A. 単一HTMLファイルで遊ぶ（いちばん手軽）

`aether-lance.html` は1つのファイルで完結しています。ダブルクリックしてブラウザで開くだけで遊べます。サーバーもインターネット接続もいりません（日本語のドットフォント DotGothic16 も、使う文字だけを埋め込んであります）。

ファイルの入手方法は次の2つです。

- **GitHub Actions から:** このリポジトリの Actions →「AETHER LANCE」ワークフローの実行結果 → Artifacts の `aether-lance-single-html` をダウンロードして展開します。
- **自分でビルドする:** 下記「3. 開発」の手順で `npm run build:single` を実行すると、`dist-single/aether-lance.html` ができます。

### B. Android アプリ（APK）で遊ぶ

- **APK の入手:** 通常版はリポジトリの [`dist/AetherLance.apk`](../dist/AetherLance.apk)、HD 版は [`dist/AetherLanceHD.apk`](../dist/AetherLanceHD.apk) です。Actions の実行結果の Artifacts `aether-lance-apk` からも入手できます。2つは別のアプリ（`com.aetherlance.game` と `com.aetherlance.game.hd`）なので、両方を同時にインストールできます。セーブデータも別々です。
- **インストール:** Android 端末で APK を開き、「提供元不明のアプリ」のインストールを許可してインストールします（Android 8.0 以上）。
- 横画面・全画面で起動します。インターネット接続は不要で、通信の権限も持っていません。
- **戻るボタン:** ゲーム中はポーズ、メニューでは「戻る」として働きます。タイトル画面で押すとアプリを終了します。
- セーブデータ（設定・ハイスコア・リプレイ）はアプリ内に保存されます。新しい版の APK は、上書きインストールでデータを引き継げます（すべての版を同じ鍵で署名しています）。
- Bluetooth のゲームパッドやキーボードもそのまま使えます。

APK は、ゲーム本体（単一HTML版）を全画面の WebView で動かす小さなアプリです（通常版 約170KB、HD 版 約420KB）。作り方は「3. 開発」を参照してください。

### HD 版について

ゲームの中身（ステージ、敵、ボス、音楽、操作、バランス）は通常版と同じで、絵だけを現代的な高品位グラフィックに描き直した版です。

- **キャラクター:** 自機・敵・ボスを、同じ設計図から3倍の解像度で作り直します。ドットの色段階ではなく連続した陰影に、光沢（スペキュラ）とリムライトを加え、輪郭はアンチエイリアスで滑らかにしています。
- **地形:** 輪郭を滑らかな曲線に描き直し、ステージごとに新しい質感を付けています（宇宙ステーションの金属パネル、洞窟の岩と結晶、有機体の組織、嵐の遺跡の石材、鋳造所のハザード塗装、聖堂の大理石と金の象眼）。
- **背景:** ディザのない滑らかなグラデーション、丸く瞬く星、滑らかな遠景レイヤー。
- **エフェクト:** 光るエネルギー弾とビーム、グラデーションの噴射炎、柔らかい爆発や火の粉、レーザーや雷、溶岩流。
- **文字:** HUD とメニューはベクターフォント（Rajdhani）、日本語は端末の標準ゴシック体。ロゴもクロームの立体的なデザインに変えています。
- 既定の画面設定は FIT（画面いっぱい）・CRT 効果なしです。描画は3倍の解像度で行い、メモリや CPU コア数が少ない端末では自動で2倍に下げます。重いときは OPTIONS → VIDEO → Quality を LOW にしてください。
- ブラウザで遊ぶ場合は `npm run build:single:hd` で `dist-single/aether-lance-hd.html` を作ります。

### C. GitHub Pages で遊ぶ

ワークフロー `.github/workflows/aether-lance.yml` は、デフォルトブランチへの push で `dist/` を GitHub Pages に公開します。初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。

Pages 版は PWA に対応しています。スマートフォンで「ホーム画面に追加」すると、全画面で、しかもオフラインでも遊べます（iPhone では、ブラウザ上ではフルスクリーンにできないため、この方法がおすすめです）。

### D. 開発サーバーで遊ぶ

```bash
cd aether-lance
```

```bash
npm install
```

```bash
npm run dev
```

表示された URL（通常は http://localhost:5173/ ）をブラウザで開きます。

### 推奨環境

- Chrome / Edge / Firefox / Safari の最新版。WebGL2 が使えないときは、自動で Canvas2D 描画に切り替わります（CRT やブルームは省略されます）。
- iPhone で音が出ないときは、マナースイッチをオフにしてください。
- 処理が重いときは、オプションの VIDEO → Quality を LOW にするか、CRT effect と Bloom を下げてください（AUTO にしておくと、重いときに自動で軽くなります）。

---

## 2. 遊び方

### 2.1 操作

**キーボード**（OPTIONS → CONTROLS で変更できます）

| 操作 | 主キー | 副キー |
|---|---|---|
| 移動 | ← ↑ → ↓ | W A S D |
| ショット（押しっぱなしで連射） | Z | J |
| ランスドライブ | X | K |
| 速度アップ／ダウン | C ／ Shift+C | L ／ Shift+L |
| 速度の直接指定 | 1 〜 4 | — |
| ドローン陣形の切り替え | V | I |
| ポーズ | Esc | P |
| メニューの決定／戻る | Enter・Space・Z ／ Esc・Backspace・X | |

**ゲームパッド**（Standard Mapping）

| 操作 | ボタン |
|---|---|
| 移動 | 十字キー／左スティック |
| ショット／ランスドライブ | A ／ B |
| ドローン陣形 | X |
| 速度アップ／ダウン | Y・RB ／ LB |
| ポーズ | START |

**タッチ**

- 画面のどこでもドラッグすると、指の動いた分だけ自機が動きます（指で自機が隠れません）。
- 指が触れている間は自動でショットします。
- 右下の DRIVE ボタンでランスドライブ、FORM ボタンで陣形の切り替え、右上の II ボタンでポーズします。ボタンの左右はオプションで入れ替えられます。

### 2.2 自機とパワーアップ

自機は「AL-7 KESTREL Mk.II」。白い装甲に2基の大型プロペラントタンクと長いレーザー砲を備えた重戦闘機です。敵の編隊やキャリア（光っている敵）を倒すと、アイテムが出ます。

| アイテム | 効果 |
|---|---|
| ARMS CRYSTAL（赤） | メイン武器のレベル +1（最大 Lv5） |
| WISP CRYSTAL（青） | ドローン「WISP」+1（最大4機） |
| AEGIS CRYSTAL（緑） | 3回まで攻撃を防ぐバリア |
| DRIVE CELL（金） | ドライブゲージ +34 |
| ARMS CHIP（白・P/F/R） | メイン武器の種類を変更 |
| SUB CHIP（紫・B/S） | サブ武器の取得・レベルアップ |
| 1UP（虹色） | 残機 +1 |
| STAR CHIP（小さな星） | 得点とドライブゲージ |

**メイン武器**

- **PULSE:** まっすぐ飛ぶ高速連射。1体あたりの火力が最も高い武器です。
- **FAN:** 扇状に広がる拡散弾。後方にも撃つので、広い範囲を押さえられます。
- **RAY:** 敵と地形を貫く光の槍。縦に並んだ敵や、地形の奥にいる敵に強い武器です。

**サブ武器**（自動で発射）

- **GRAVITY BOMB:** 地形に沿って転がる爆弾。地上の敵に強い武器です。
- **SEEKER:** 背後や上下の敵を追いかけるミサイル。

**ドローン（WISP）の陣形**

- **WING:** 上下に広がって並びます。
- **TRAIL:** 自機の軌跡を追いかけます。
- **ORBIT:** 自機の周りを回り、敵の弾を防ぎます。

**ランスドライブ:** ゲージが100%になったら発動できます。衝撃波で画面内の敵弾を STAR CHIP に変え、6秒間は攻撃力と獲得スコアが大きく上がります。発動直後の1秒間は無敵です。ゲージは、敵を倒す、敵弾にかする（グレイズ）、アイテムを取る、のどれでもたまります。

**ミスしたとき:** 武器のレベルが下がります（NORMAL では −1）。散ったドローンは、しばらく画面に残るので、回収できます。

### 2.3 モード

| モード | 内容 |
|---|---|
| ARCADE | 全6ステージに挑みます。難易度と復活方式（その場復活／チェックポイント戻り）を選びます |
| PRACTICE | 到達したステージを、好きな装備と開始位置（チェックポイント・中ボス・ボス）で練習できます |
| BOSS RUSH | ボスとの連戦をタイムアタックします。ARCADE を1周クリアすると解放されます |
| RANKING | 難易度ごとのハイスコアを表示します。1位の記録はリプレイとして保存され、Z キーで再生できます |

**難易度:** EASY（残機5・地形に当たってもミスにならない）／ NORMAL ／ HARD（弾が速い）／ ORDEAL（2周目から始まる。HARD を1周クリアするか、NORMAL の2周目をクリアすると解放）。NORMAL 以上では、1周クリアすると2周目に進むかどうかを選べます。2周目は敵の攻撃が激しくなり、倒した敵が撃ち返し弾を出すようになります。そのかわり、ステージクリアボーナスが1.5倍になります。

### 2.4 ステージ

| # | ステージ | ボス |
|---|---|---|
| 1 | ORBITAL RING（軌道環） | WARDEN-CLASS CARRIER |
| 2 | PRISM CAVERN（晶洞） | LUMEN GOLEM |
| 3 | HIVE GARDEN（蝕苑） | MATRIARCH |
| 4 | STORM CROWN（嵐冠） | TEMPEST LEVIATHAN |
| 5 | FOUNDRY（鋳造廠） | ANVIL |
| 6 | CHOIR CORE（聖歌核） | THE CHOIR |

### 2.5 オプション

- **GAME:** 言語（日本語／English）、ショットの方式（押しっぱなし／切り替え）、タッチの感度、ボタン配置、振動
- **CONTROLS:** キーボードとゲームパッドのキー割り当て、アナログ移動
- **VIDEO:** 拡大方式、CRT効果、走査線、ブルーム、なめらか描画、品質、フルスクリーン、FPS表示
- **AUDIO:** 音量（マスター／BGM／SE）、サウンドテスト
- **ACCESS:** 画面の揺れ、フラッシュ軽減、弾の強調表示、当たり判定の表示、背景の暗さ、ゲーム速度（90%以下にすると、ランキングに ASSIST と表示されます）
- **DATA:** 設定の初期化、記録の消去、セーブデータの書き出し／読み込み

セーブデータ（設定・ハイスコア・解放状況・リプレイ）は、ブラウザの localStorage に保存されます。

---

## 3. 開発

Node.js 22 以上を推奨します（Vite 8 の要件）。実行時の依存ライブラリはありません（開発時だけ TypeScript / Vite / Vitest を使います）。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 型チェックのあと、`dist/` に本番ビルド（PWA 一式を含む） |
| `npm run build:single` | `dist-single/aether-lance.html` に単一HTML版をビルド |
| `npm test` | ユニットテスト（MML とステージの拍の整合、全ステージの自動クリア、全ボスの撃破、決定性、リプレイ） |
| `npm run lint` | 型チェックのみ |
| `npm run e2e` | Playwright による E2E テスト（先に `build` と `build:single` が必要） |
| `npm run build:hd` ／ `npm run build:single:hd` | HD 版を `dist-hd/` ／ `dist-single/aether-lance-hd.html` にビルド |
| `./android/build-apk.sh` | 通常版と HD 版の APK を `dist-apk/AetherLance.apk` と `dist-apk/AetherLanceHD.apk` にビルド（JDK 17 以上、Gradle 8.7 以上、Android SDK の platform 34 が必要。`ANDROID_HOME` を設定しておく） |
| `node scripts/make-pv.mjs` | 40秒のプロモーション映像（文字なし・ゲーム内の BGM と効果音つき、1080p 60fps）を `pv/aether-lance-pv.mp4` に書き出す（先に `build:single` が必要。ffmpeg を使う。`--preview` で低解像度の試し書き） |
| `python3 scripts/device-test.py` | USB でつないだ Android 端末で自動テストを行い、バランスと FPS のレポートを作る（下記） |
| `node scripts/subset-font.mjs` | 画面に出す文字を増やしたときに、埋め込みフォント（DotGothic16 のサブセット）を作り直す |

**実機での自動テスト（バランス確認）:** スマートフォンを USB でつないだパソコンで次を実行すると、APK をインストールして自動テストを始めます。

```bash
python3 scripts/device-test.py --minutes 60
```

ゲームの自動テストモード（URL の `?autotest=<分>`）では、先読み型の自動操縦（無敵ではない）が各ステージを「そのステージに普通に着いたときの装備」で順に遊び、難易度（既定は NORMAL と HARD）と武器を入れ替えながら、指定の時間だけ挑戦を続けます。死亡（原因つき）、中ボスとボスの結果と時間、クリア、実機の FPS を記録し、スクリプトはそれを logcat から受け取って画面に流します。数分おきに画面を撮り、ローカル LLM（Ollama、または LM Studio などの OpenAI 互換サーバー）が動いていれば、画面の見やすさを確認させ、最後にバランスの所見もまとめさせます。結果は `device-test-<日時>/report.md`（ほかに `summary.json`、`events.jsonl`、`logcat.txt`、`shots/`）に出ます。主なオプション: `--edition hd`、`--diff normal`、`--stages 3-6`（`1,5` のような列挙も可）、`--llm <URL かマシン名>`（例 `--llm kapitsa`。マシン名だけなら Ollama・LM Studio・MLX などのよく使うポートを順に探す）、`--model <名前>`（多少表記が違っても近い名前を選ぶ）、`--vision`（画像を読めるモデルに画面も見せる）、`--no-llm`。USB デバッグを ON にし、スマートフォンのロックを解除しておいてください。パソコンには adb（Android platform-tools）が必要です。ブラウザでも `?autotest=10&diff=normal` のように付けて開けば同じテストが動き、結果は開発者ツールのコンソールに `ALTEST` の行として出ます。

**デバッグモード:** URL に `?debug=1` を付けて開くと、デバッグ表示とデバッグキーが使えます。

| キー | 機能 |
|---|---|
| `` ` `` | デバッグ表示の切り替え |
| H | 当たり判定の表示 |
| I | 無敵 |
| M | 最大パワー |
| F1〜F6 | ステージ1〜6へ移動 |
| PageDown | 次のチェックポイントへ |
| N ／ B | 中ボス／ボスを呼び出す（出現中はパーツを撃破） |
| O ／ . | 一時停止／1フレーム進める |
| E | 敵を出現させる |
| Shift+X | 負荷テスト |

**ソースの構成**

```
src/core      ゲームループ、入力、決定的な数学関数、乱数、シーン管理、セーブ
src/render    パレット、スプライト生成、フォント、WebGL2 ポストエフェクト、ワールドと HUD の描画
src/audio     MML パーサ、WebAudio シンセ、シーケンサ、効果音
src/game      ワールド（固定順の更新）、自機・武器・ドローン、地形、敵スクリプト、オートパイロット、リプレイ
src/content   スプライト、敵、ボス、ステージ、背景、楽曲（すべてコードで定義）
src/scenes    タイトル、メニュー、ゲーム、ポーズ、オプション、練習、ランキング、エンディング、デモ
tests/unit    Vitest、tests/e2e  Playwright
android/      Android アプリ（WebView のシェル。MainActivity.java が APK 内のゲームを https://appassets.androidplatform.net/ として配信する）
```

---

## 4. クレジット

- ゲームデザイン、プログラム、グラフィック、音楽、効果音: AETHER LANCE 制作チーム（Claude Code で開発）
- フォント: [DotGothic16](https://fonts.google.com/specimen/DotGothic16)（Copyright 2020 The DotGothic16 Project Authors）、HD 版は [Rajdhani](https://fonts.google.com/specimen/Rajdhani)（Copyright 2014 Indian Type Foundry）。どちらも SIL Open Font License 1.1 で、ライセンス全文は `public/licenses/` にあります。

本作は特定の既存作品の再現や移植ではない、オリジナル作品です。
