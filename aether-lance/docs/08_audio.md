# 08. サウンド仕様

## 1. 方針

- 音声ファイルは1つも使わない。BGMとSEはすべて、WebAudioの自作シンセでリアルタイムに合成するか、起動時に事前レンダリングする。
- 目標の音色: PSG（矩形波、三角波、ノイズ）の明快さと、FM音源の厚みを併せ持つ「拡張チップチューン」。リバーブとディレイで空間を作る。
- BGMはメロディを重視し、各ステージの曲を一度聴いたら口ずさめるようにする。ボス曲は緊張感を重視する。
- SEはBGMを邪魔しない。特に、絶えず鳴り続ける自機のショット音は、小さく短くする。

## 2. オーディオグラフ

```
[各ボイス] → [チャンネルGain(+Pan)] → [BGMバス 0.55] ─┐
                                   → [SFXバス 0.80] ─┼→ [マスターGain 0.8] → [DynamicsCompressor] → destination
                                   → [UIバス  0.60] ─┘
            ↘ [リバーブ送り] → ConvolverNode（生成したインパルス）→ マスター
            ↘ [ディレイ送り] → DelayNode + フィードバック + LPF → マスター
```

| ノード | 設定 |
|---|---|
| Compressor | threshold −14dB、knee 12、ratio 4、attack 3ms、release 150ms |
| Reverb | ステレオのホワイトノイズに指数減衰（1.8秒）を掛けたインパルスを起動時に生成。プリディレイ20ms。送り量: BGMのリードとパッド 0.18、大爆発 0.25 |
| Delay | 付点8分音符（BPMに同期）、フィードバック0.3、ウェット0.15、LPF 3kHz。リード専用 |
| 音量オプション | マスター、BGM、SE を0〜10の11段階。カーブは `gain = (v/10)^2` |

- AudioContext はBootシーンの最初のユーザー操作で生成し、`resume()` する（iOSのため、同じイベントハンドラ内で無音のバッファを1回再生する）。
- iOSでは、マナースイッチがONだとWebAudioが鳴らない。初回起動時のBoot画面に「音が出ない場合は、マナースイッチをオフにしてください」と小さく表示する。

## 3. シンセサイザー（`core/audio/synth.ts`）

### 3.1 オシレーター

| 種類 | 実装 |
|---|---|
| `pulse12 / pulse25 / pulse50 / pulse75` | デューティ比ごとに `PeriodicWave` を事前生成する（フーリエ係数32次） |
| `tri` | 三角波（ファミコン風の4bit段階化オプション `tri4`） |
| `saw` | ノコギリ波 |
| `sine` | 正弦波 |
| `noise` | 事前生成したホワイトノイズのバッファ（2秒、ループ）。`noiseShort` は周期の短いメタリックなノイズ（93サンプル周期） |
| `fm` | 2オペレーター。モジュレーター（比率、深さ、深さのエンベロープ）→ キャリアの周波数 |

### 3.2 パッチ（楽器）のパラメータ

```ts
interface Patch {
  osc: OscType; detune?: number; unison?: 1 | 2 | 3; unisonSpread?: number; // cents
  adsr: [a: number, d: number, s: number, r: number];                    // 秒、sは0〜1
  filter?: { type: 'lowpass' | 'bandpass' | 'highpass'; cutoff: number; q: number; env?: number; envDecay?: number };
  vibrato?: { delay: number; rate: number; depth: number };              // depthはcents
  pitchEnv?: { from: number; time: number };                              // 半音単位の開始オフセット
  portamento?: number;                                                    // 秒
  fm?: { ratio: number; index: number; indexDecay?: number };
  gain: number;
}
```

### 3.3 楽器のプリセット（最低限）

| ID | 用途 | 設定の要点 |
|---|---|---|
| `lead_saw` | メインのリード | saw ×2（±7 cents）、LPF 4kHz、ビブラート（遅延0.25秒、5.5Hz、15 cents） |
| `lead_pulse` | 対旋律 | pulse25、軽いビブラート |
| `lead_fm` | 輝くリード | fm（比率2、index 3 → 1） |
| `bell` | ベル、アルペジオ | fm（比率3.5、index 5、減衰0.4秒） |
| `bass_fm` | ベース | fm（比率1、index 2.5、減衰0.15秒）+ sine |
| `bass_pulse` | 8ビートのベース | pulse50 + LPF 1.2kHz |
| `pad` | パッド | saw ×3 + LPF 1.5kHz、アタック0.3秒、リリース0.8秒 |
| `choir` | ST6の聖歌 | saw → 3つのバンドパス（母音「あ」のフォルマント 800 / 1150 / 2900Hz）、ゆっくりしたビブラート |
| `organ` | ST6 | sine の倍音加算（1, 2, 3, 4, 6倍）|
| `arp_pulse12` | 高速アルペジオ | pulse12、短いディケイ |
| `kick` | キック | sine、ピッチエンベロープ 150 → 45Hz（60ms）、ディケイ0.25秒 |
| `snare` | スネア | noise（BPF 1.8kHz）+ tri 180Hz、ディケイ0.15秒 |
| `hat_c / hat_o` | ハイハット | noise（HPF 7kHz）、0.04秒 / 0.25秒 |
| `metal` | ST5の金属打楽器 | noiseShort + BPF 3kHz |
| `tom` | タム | sine、ピッチエンベロープ |
| `crash` | クラッシュ | noise（HPF 5kHz）、1.2秒 |
| `shaker / wood` | ST3の有機的な打楽器 | noise BPF 5kHz の短いもの / sine 600Hzの急激なピッチ下降 |
| `thunder` | ST4の効果音的な打楽器 | noise LPF 400Hz、2秒 |

## 4. シーケンサーとMML

### 4.1 MMLの文法（`core/audio/mml.ts`）

| コマンド | 意味 |
|---|---|
| `t<n>` | テンポ（BPM） |
| `o<n>` / `<` / `>` | オクターブの指定（0〜8） / 1つ下げる / 1つ上げる |
| `l<n>` | 既定の音長（1, 2, 4, 8, 16, 32。付点 `.` も可） |
| `c d e f g a b` | 音符。`+` または `#` でシャープ、`-` でフラット。直後に音長（例: `c8.`） |
| `r` | 休符 |
| `&` | タイ（`c4&c16`） |
| `v<0-15>` | 音量 |
| `@<名前>` | 楽器（パッチID） |
| `q<1-8>` | ゲートタイム（音長に対する発音の割合 n/8） |
| `p<-64..64>` | パン |
| `k<n>` | トランスポーズ（半音） |
| `[ ... ]<n>` | n回の繰り返し。`|` は最終回で抜ける位置 |
| `L` | ループの開始位置（曲の最後まで来たら、ここへ戻る） |
| `;` | 行コメント |

- 分解能: 全音符 = 192ティック（4分音符 = 48ティック）。
- ドラムのトラック（`@drums`）では、音名をドラムキットに割り当てる: `c` = kick、`d` = snare、`e` = tom、`f+` = hat_c、`a+` = hat_o、`b` = crash。
- 1曲あたり最大8トラック。トラック名は `lead, lead2, arp, bass, pad, drums, fx, drive`。

### 4.2 曲の定義

```ts
export const st1: Song = {
  id: 'st1', title: 'Breaking Orbit', bpm: 150,
  tracks: { lead: '...', bass: '...', drums: '...', drive: '...' },
  driveTracks: ['drive'],          // ランスドライブ中だけ鳴らすトラック
  noteEventTracks: [],             // ゲームへ音符イベントを送るトラック（ST6最終ボス）
};
```

### 4.3 スケジューリング

- 先読み方式: 25msごとのタイマーで、現在時刻から100ms先までの音符を `AudioContext.currentTime` 基準でスケジュールする。
- ボイスは音符ごとに OscillatorNode と GainNode を生成し、エンベロープは `setValueAtTime / linearRampToValueAtTime / setTargetAtTime` で書く。BGMの同時発音数は最大24（超えたら、最も古いリリース中のボイスを止める）。
- 曲の切り替え: クロスフェード（既定0.5秒）、即時の切り替え、フェードアウトのみ、の3種類。
- タブの非表示とポーズ: 曲の位置を保存して停止し、再開したら同じ位置から鳴らす。

## 5. 適応的な音楽

| 状況 | 処理 |
|---|---|
| ランスドライブ | 曲の `drive` トラック（追加の打楽器とハーモニー）を1拍かけてフェードインする。終了時に1拍かけてフェードアウトする |
| ポーズ | BGMにLPF（600Hz）を0.2秒かけて掛け、−6dB |
| 自機の撃墜 | BGMを60fのあいだ −6dB |
| WARNING | 道中の曲を1.5秒でフェードアウト → 警告のサイレン（`warning`）→ ボス曲 |
| ボスの撃破 | ボス曲を即座に停止 → 爆発音 → `jingle_clear` |
| ST6 の「静寂」区間 | 4小節かけてフェードアウトし、`heartbeat` のみにする |

## 6. ビート同期（ST6）［MUST］

- ST6の曲はBPM 150（1拍 = ちょうど24f）。
- **主クロックはゲームのフレーム。** ゲームは曲の開始フレームを記録し、`beat = floor((frame − startFrame) / 24)` で拍を求める。敵の発射はこの拍で決める（決定的）。
- **音符イベント:** CANTORの旋律弾のために、ゲーム側でも同じMMLを同じパーサで解析し、`ティック → フレーム`（2ティック = 1f）に変換した音符のリストを持つ。オーディオのクロックには依存しない。
- **音声側の追従:** シーケンサーは「曲のフレーム → AudioContextの時刻」のアンカーを持つ。ゲームのフレームが処理落ちのスキップで遅れたら、毎秒の確認でアンカーを補正する（1回の補正は最大20ms）。両者のずれは30ms以内に保つ。
- ST6ではヒットストップとスローを使わない（→07 §9.2）。

## 7. SE

### 7.1 再生の規則

- 優先度（1〜5）と同時発音数の上限を、SEごとに持つ。SE全体の同時発音数は16。上限を超えたら、優先度の低いものから止める。
- 同じSEの最小間隔: 既定2f（ショット音は4f、ヒット音は3f）。同じフレームの重複は1回にまとめる。
- パン: `pan = (x − 240) / 240 × 0.6`。
- 起動時に OfflineAudioContext で、全SEを AudioBuffer に事前レンダリングする［SHOULD］。再生は AudioBufferSourceNode で行い、ピッチを ±3% ランダムに揺らす（rngFx。連続音の機械っぽさを消すため）。長さが可変のSE（`laser_charge` など）は、実行時に合成する。

### 7.2 SE一覧

| ID | 用途 | 合成のレシピ | 長さ | 優先 | 同時 |
|---|---|---|---|---|---|
| `shot_pulse` | PULSEの発射 | pulse25 880 → 660Hz、音量0.15 | 40ms | 1 | 2 |
| `shot_fan` | FANの発射 | pulse12 660 → 520Hz | 50ms | 1 | 2 |
| `shot_ray` | RAYの発射 | saw + HPF、1200 → 2400Hz（上昇） | 90ms | 2 | 2 |
| `bomb_drop` | ボムの投下 | tri 300 → 150Hz | 60ms | 1 | 2 |
| `bomb_explode` | ボムの爆発 | noise LPF 800 → 200Hz | 200ms | 2 | 3 |
| `seeker_launch` | シーカーの発射 | noise BPF 2kHz + sine 600 → 900Hz | 80ms | 1 | 2 |
| `lancer_dash` | LANCERの突進 | noise BPF 1.5kHz のスイープ上昇 + saw 200Hz | 200ms | 2 | 2 |
| `hit_enemy` | 敵への命中 | pulse50 1400 → 900Hz + クリック（noise 5ms） | 25ms | 2 | 3 |
| `hit_armor` | 装甲への命中 | fm（比率1.41）2400Hz の「キン」 | 60ms | 2 | 2 |
| `explode_s` | 小爆発 | noise LPF 3000 → 300Hz + sine 120 → 40Hz | 180ms | 3 | 4 |
| `explode_m` | 中爆発 | noise 2500 → 150Hz + sine 90 → 30Hz | 350ms | 3 | 3 |
| `explode_l` | 大爆発 | noise 2000 → 100Hz + sine 70 → 25Hz、リバーブ0.3 | 700ms | 4 | 2 |
| `boss_die` | ボス撃破 | explode_l ×3を重ね + 低いうなり2.5秒 | 3s | 5 | 1 |
| `player_die` | 自機の撃墜 | saw 1600 → 80Hz の下降 + noiseの炸裂 | 600ms | 5 | 1 |
| `speed_change` | 速度の切替 | pulse 2音（上げるときは上昇、下げるときは下降） | 120ms | 2 | 1 |
| `formation` | 陣形の切替 | tri の3音アルペジオ | 90ms | 2 | 1 |
| `pickup_arms` | ARMS取得 | pulse の上昇アルペジオ（ド・ミ・ソ・ド）+ きらめき | 200ms | 4 | 1 |
| `pickup_wisp` | WISP取得 | bell 1200Hz | 300ms | 4 | 1 |
| `pickup_aegis` | AEGIS取得 | sine 520 + 780Hz のきらめく和音 | 400ms | 4 | 1 |
| `pickup_drive` | DRIVE取得 | saw 400 → 1600Hz + フィルタースイープ | 250ms | 4 | 1 |
| `pickup_chip` | チップ取得 | pulse 2音（ラ → ミ） | 120ms | 4 | 1 |
| `chip_tick` | チップの文字の切り替わり | ごく小さなクリック | 10ms | 1 | 1 |
| `star` | STAR CHIP | sine 2600Hz、音量0.08 | 20ms | 1 | 4 |
| `extend` | エクステンド | 長調のファンファーレ6音 | 600ms | 5 | 1 |
| `graze` | かすり | noise HPF 6kHz、音量0.06 | 15ms | 1 | 2 |
| `barrier_hit` | バリア被弾 | fm（比率1.41）800Hz | 200ms | 4 | 1 |
| `barrier_break` | バリア消失 | noise BPF 4kHz + sineのピン音×5（ガラス） | 300ms | 4 | 1 |
| `drive_ready` | ゲージ満タン | bell の和音 | 400ms | 3 | 1 |
| `drive_start` | ドライブ発動 | noise スイープ 200 → 6000Hz + sine 60Hz の重低音 + choir の和音 | 800ms | 5 | 1 |
| `drive_end` | ドライブ終了 | 下降スイープ | 300ms | 3 | 1 |
| `warn_behind` | 後方警告 | pulse 880 / 660Hz の2音×2 | 300ms | 4 | 1 |
| `mine_arm` | 機雷の起動 | 2kHz の断続音（4fごと） | 500ms | 3 | 2 |
| `laser_charge` | レーザーの予告 | saw 200 → 1000Hz（予告の長さに合わせる）+ トレモロ | 可変 | 3 | 2 |
| `laser_fire` | レーザーの照射 | noise + saw 150Hz のうなり（照射中に持続） | 可変 | 3 | 2 |
| `lightning_warn` | 落雷の予告 | ゲートを掛けたノイズのパチパチ音 | 可変 | 3 | 2 |
| `lightning_strike` | 落雷 | noise の炸裂 + LPFスイープ + 雷鳴1秒 | 1s | 4 | 2 |
| `press_slam` | プレス | sine 80 → 30Hz + noise LPF 400Hz | 200ms | 3 | 2 |
| `enemy_fire_s` | 敵の発射（小） | pulse12 1000 → 700Hz、音量0.12 | 30ms | 1 | 3 |
| `enemy_fire_m` | 敵の発射（中） | 矩形波 500 → 300Hz | 60ms | 2 | 2 |
| `enemy_fire_l` | 敵の発射（大） | saw 300 → 120Hz | 120ms | 3 | 2 |
| `boss_phase` | フェーズ移行 | saw 60Hz + LFO の咆哮 + 金属音 | 800ms | 5 | 1 |
| `glass_shatter` | ゴーレム撃破 | barrier_break の大型版 | 1.2s | 5 | 1 |
| `wave_arc` | 音波弾 | sine のフォルマント（「うー」）スイープ | 300ms | 2 | 2 |
| `organic_pop` | ST3の有機的な敵の撃破 | noise BPF 600Hz の短い「ポン」 | 120ms | 3 | 3 |
| `heartbeat` | 心音 | sine 55Hz のドクン、ドクン | 400ms | 4 | 1 |
| `menu_move` | カーソル移動 | pulse 1500Hz | 20ms | 2 | 1 |
| `menu_confirm` | 決定 | pulse の上昇2音 | 100ms | 3 | 1 |
| `menu_cancel` | キャンセル | pulse の下降2音 | 100ms | 3 | 1 |
| `pause` | ポーズ | 柔らかい和音 | 300ms | 3 | 1 |
| `countdown` | コンティニューの秒読み | 1000Hz | 30ms | 3 | 1 |
| `stage_intro` | ステージ紹介 | ノイズのウーッシュ + 和音 | 1s | 3 | 1 |
| `tally` | ボーナス集計のカウント | 短いクリック（2fごと） | 10ms | 2 | 1 |

## 8. BGM一覧

| ID | 曲名 | BPM / 拍子 | 調 | 長さ（ループ） | 雰囲気、構成、楽器 |
|---|---|---|---|---|---|
| `title` | Aether Lance（メインテーマ） | 120 / 4/4 | ニ短調（サビでニ長調へ） | 約60秒 | 英雄的で希望がある。イントロ4小節 → A 8小節 → B 8小節 → ループ。lead_saw、lead_pulse（対旋律）、bass_fm、pad、ドラム。進行 A: Dm – B♭ – C – Am / Gm – B♭ – C – D(sus4 → D)。B: B♭ – C – Dm – Dm/C / Gm – A7 – Dm – A7 |
| `st1` | Breaking Orbit | 150 / 4/4 | ホ短調 | 約90秒 | 疾走感。8分音符で刻むベース。進行 A: Em – C – D – Bm / Em – C – Am – B7。B: C – D – Em – Em / C – D – B7sus4 – B7 |
| `st2` | Glass Labyrinth | 120 / 4/4 | 嬰ヘ短調 | 約90秒 | 神秘的。bell のアルペジオ、空間的なディレイ。進行 F#m – D – E – C#m ×2 / Bm – C#m – D – E |
| `st3` | Living Garden | 144 / 7/8（2+2+3） | ハ短調 | 約80秒 | 有機的でうねる。shaker と wood の打楽器、低いパッド。進行 Cm – A♭ – Fm – G |
| `st4` | Tempest Crown | 180 / 4/4 | イ短調 | 約80秒 | 最速。高速アルペジオ、雷鳴の打楽器。進行 Am – F – G – Em / F – G – Am – Am |
| `st5` | Iron Foundry | 144 / 4/4 | ト短調 | 約90秒 | インダストリアル。4つ打ちのキック、metal の打楽器、歪んだベース。進行 Gm – Gm – E♭ – F / Cm – D – Gm – D7 |
| `st6` | Choir | 150 / 4/4 | ロ短調 | 約100秒 | 荘厳。choir、organ、bell。進行 Bm – G – D – A / Em – G – F#sus4 – F# |
| `boss` | Collision Course | 150 / 4/4 | ハ短調（フリギア的） | 約60秒 | 緊迫。半音階のベースのオスティナート。進行 Cm – D♭ – Cm – B♭ |
| `final1` | HALO | 150 / 4/4 | ロ短調 | 約60秒 | 形態1。徐々に盛り上がる。打楽器は拍を明確にする（プレイヤーがリズムで弾を読めるように） |
| `final2` | CANTOR | 150 / 4/4 | ホ短調 → ロ短調 | 約90秒 | 形態2。**リードの旋律がそのまま弾幕になる**。音域は2オクターブ以内、1拍あたり8音以下。旋律の輪郭（上がる、下がる）が、弾のくぐりやすい形になるように作曲する |
| `heartbeat` | — | 60 → 120 | — | ループ | 形態3。心音だけ。HPが減るほどテンポが上がる |
| `warning` | — | — | — | 3秒 | 警告のサイレン（矩形波 700 / 500Hz を0.5秒ずつ交互、LPF） |
| `jingle_clear` | Stage Clear | 120 | ニ長調 | 6秒 | 明るいファンファーレ |
| `jingle_gameover` | Game Over | 80 | ニ短調 | 8秒 | 下降する旋律、静かに終わる |
| `name_entry` | Hall of Pilots | 100 | ヘ長調 | 約40秒 | 穏やかで達成感がある |
| `ending` | Dawn over the Ring | 100 | ニ長調 | 約90秒 | メインテーマを長調でゆったり再現する。スタッフロールに合わせる |

- **作曲の規則:**
  - すべての旋律はオリジナルとする（→01 §5）。上のコード進行は骨組みの指定であり、旋律は自由に作曲する。
  - メインテーマの動機（冒頭2小節）を、`st6`、`final2`、`ending` に変形して再登場させ、作品に一貫性を持たせる。
  - 各ステージの曲は、ループの継ぎ目が分からないようにする（ループの直前の小節は、冒頭へつながるフレーズにする）。
- 音量の目安: BGMのピークは −6dBFS、SEの最大は −3dBFS（コンプレッサー通過後）。ショット音はBGMのリードより十分小さくする。
- MMLのサンプルは [11 §5](11_appendix.md) にある。
