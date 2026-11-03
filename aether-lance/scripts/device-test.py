#!/usr/bin/env python3
"""AETHER LANCE device test runner (run on the computer the phone is plugged into).

Installs the APK on the USB-connected Android phone, starts the game's automated test mode
(?autotest=<minutes>, src/scenes/autotest.ts) and follows it live over logcat: every attempt, death (with its
cause), midboss / boss result and time, stage clear and frame-rate sample. Every few minutes it takes a screenshot
and, when a local LLM is running (Ollama or an OpenAI-compatible server such as LM Studio), has it look at the
screen. At the end it writes report.md (numbers, automatic findings and the local LLM's balance review),
summary.json, events.jsonl, logcat.txt and the screenshots into the output folder.

  python3 scripts/device-test.py                       # 60 minutes, classic edition, NORMAL and HARD
  python3 scripts/device-test.py --edition hd --minutes 30 --diff normal
  python3 scripts/device-test.py --llm http://localhost:1234 --model qwen2.5-vl-7b-instruct

Needs Python 3.8+ and adb (Android platform-tools). Only the standard library is used.
Phone: Developer options → USB debugging on, accept the computer's key, keep the phone unlocked.
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)              # aether-lance/
REPO = os.path.dirname(PROJ)              # repository root (dist/*.apk)
PKG = {'classic': 'com.aetherlance.game', 'hd': 'com.aetherlance.game.hd'}
ACTIVITY = 'com.aetherlance.game.MainActivity'
VISION_HINTS = ('llava', 'vision', '-vl', 'vl:', 'qwen2.5vl', 'qwen2.5-vl', 'qwen3-vl', 'gemma3', 'minicpm-v', 'moondream',
                'bakllava', 'pixtral', 'mistral-small3', 'granite3.2-vision', 'llama4')


def now() -> str:
    return dt.datetime.now().strftime('%H:%M:%S')


def say(msg: str) -> None:
    print(f'[{now()}] {msg}', flush=True)


# ---------------------------------------------------------------- adb
class Adb:
    def __init__(self, serial=None):
        self.exe = find_adb()
        self.serial = serial

    def cmd(self, *args):
        c = [self.exe]
        if self.serial:
            c += ['-s', self.serial]
        return c + list(args)

    def run(self, *args, timeout=60, check=False) -> str:
        r = subprocess.run(self.cmd(*args), capture_output=True, timeout=timeout)
        out = r.stdout.decode('utf-8', 'replace')
        if check and r.returncode != 0:
            raise RuntimeError(f'adb {" ".join(args)} failed: {out}{r.stderr.decode("utf-8", "replace")}')
        return out

    def shell(self, command: str, timeout=60) -> str:
        return self.run('shell', command, timeout=timeout).strip()

    def raw(self, *args, timeout=60) -> bytes:
        return subprocess.run(self.cmd(*args), capture_output=True, timeout=timeout).stdout


def find_adb() -> str:
    cands = [shutil.which('adb')]
    for env in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        if os.environ.get(env):
            cands.append(os.path.join(os.environ[env], 'platform-tools', 'adb'))
    cands += [os.path.expanduser('~/Library/Android/sdk/platform-tools/adb'), os.path.expanduser('~/Android/Sdk/platform-tools/adb'),
              '/opt/homebrew/bin/adb', '/usr/local/bin/adb']
    for c in cands:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    sys.exit('adb が見つかりません。Android platform-tools を入れてください（Mac: brew install android-platform-tools）。')


def pick_device(adb: Adb) -> str:
    out = subprocess.run([adb.exe, 'devices', '-l'], capture_output=True, text=True).stdout
    devs = [l.split()[0] for l in out.splitlines()[1:] if ' device ' in l + ' ']
    bad = [l for l in out.splitlines()[1:] if l.strip() and ' device ' not in l + ' ']
    if adb.serial:
        if adb.serial not in devs:
            sys.exit(f'端末 {adb.serial} が見つかりません:\n{out}')
        return adb.serial
    if not devs:
        hint = ''
        if any('unauthorized' in l for l in bad):
            hint = '\nスマホの画面に出ている「USB デバッグを許可しますか？」を許可してください。'
        sys.exit('USB でつながった Android 端末が見つかりません。' + hint +
                 '\n開発者向けオプション → USB デバッグ を ON にして、ケーブルをつなぎ直してください。\n' + out)
    if len(devs) > 1:
        say(f'複数の端末があります。{devs[0]} を使います（--serial で指定できます）。')
    return devs[0]


# ---------------------------------------------------------------- local LLM
class LLM:
    """Ollama (/api/...) or an OpenAI-compatible server (/v1/...)."""

    def __init__(self, base: str, model, timeout=600):
        self.base = base.rstrip('/')
        self.kind = None
        self.models = []
        self.model = model
        self.vision = False
        self.timeout = timeout
        try:
            tags = self._get('/api/tags')
            self.kind = 'ollama'
            self.models = [m['name'] for m in tags.get('models', [])]
        except Exception:
            try:
                ms = self._get('/v1/models')
                self.kind = 'openai'
                self.models = [m['id'] for m in ms.get('data', [])]
            except Exception:
                return
        if not self.models:
            self.kind = None
            return
        if not self.model:
            vis = [m for m in self.models if any(h in m.lower() for h in VISION_HINTS)]
            self.model = (vis or self.models)[0]
        self.vision = any(h in self.model.lower() for h in VISION_HINTS)

    @property
    def ok(self) -> bool:
        return self.kind is not None

    def _get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            return json.loads(r.read())

    def _post(self, path, body):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())

    def ask(self, prompt: str, image_png=None) -> str:
        if self.kind == 'ollama':
            body = {'model': self.model, 'prompt': prompt, 'stream': False, 'options': {'temperature': 0.2}}
            if image_png is not None:
                body['images'] = [base64.b64encode(image_png).decode()]
            return self._post('/api/generate', body).get('response', '').strip()
        content = prompt
        if image_png is not None:
            content = [{'type': 'text', 'text': prompt},
                       {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(image_png).decode()}}]
        body = {'model': self.model, 'messages': [{'role': 'user', 'content': content}], 'temperature': 0.2}
        return self._post('/v1/chat/completions', body)['choices'][0]['message']['content'].strip()


SHOT_PROMPT = """これは横スクロールシューティングゲーム「AETHER LANCE」をスマートフォンで自動プレイしている画面です（自機は左側の白い宇宙船、画面上部が HUD）。
ゲームバランスと見やすさの観点で、この1枚から分かる問題点だけを日本語で最大3行、箇条書きで答えてください。
見るところ: 弾や敵が背景に埋もれて見えにくくないか / 弾が画面を埋めて避けようがない状況になっていないか / 表示崩れ・文字の重なり・真っ黒な画面などの不具合。
問題がなければ「問題なし」とだけ答えてください。"""

REVIEW_PROMPT = """あなたはシューティングゲームのバランス調整担当です。以下はスマートフォン実機で自動操縦（慎重なプレイヤー程度の腕）が {minutes} 分間プレイした集計です。
各ステージは「そのステージに通常到達するときの装備」で開始しています（ステージ1は初期装備、ステージ2以降は強化済み）。
diff/stage ごとに: attempts=挑戦回数, clears=クリア数, deaths=死亡数, continues=コンティニュー数, gameovers=3回コンティニューしても進めず打ち切った数,
causes=死亡原因の内訳, boss / midboss = 撃破数/出現数と平均時間(秒)。fps は実機のフレームレート、battery は端末温度。

{summary}

自動検出した気になる点:
{flags}

日本語で次の4点を簡潔にまとめてください。
1. 難易度曲線（ステージが進むにつれて自然に難しくなっているか、急な壁や逆転はないか、NORMAL と HARD の差は適切か）
2. ボス・中ボスのバランス（強すぎ・弱すぎ・長すぎ・逃げられやすいもの）
3. 理不尽に感じそうな死因（特定の攻撃や地形に死亡が集中していないか）
4. 修正の優先順位つき提案（最大5件、何をどれくらい変えるか）"""


# ---------------------------------------------------------------- analysis
def summarize(events, extra):
    agg = {}
    fps = []
    open_key = None  # attempt in progress (started, not yet cleared / given up)
    for e in events:
        ev = e.get('ev')
        k = f"{e.get('diff', '?')}/{e.get('stage', '?')}"
        if ev in ('start', 'death', 'clear', 'gameover', 'boss', 'midboss'):
            a = agg.setdefault(k, {'attempts': 0, 'clears': 0, 'deaths': 0, 'gameovers': 0, 'continues': 0, 'causes': {},
                                   'boss': {'n': 0, 'defeated': 0, 'sec': []}, 'midboss': {'n': 0, 'defeated': 0, 'sec': []}, 'clearSec': [],
                                   'weapons': {}})
            if ev == 'start':
                open_key = k
                a['attempts'] += 1
                a['weapons'][e.get('weapon')] = a['weapons'].get(e.get('weapon'), 0) + 1
            elif ev == 'death':
                a['deaths'] += 1
                a['causes'][e.get('cause', '?')] = a['causes'].get(e.get('cause', '?'), 0) + 1
            elif ev == 'clear':
                open_key = None
                a['clears'] += 1
                a['continues'] += e.get('continues', 0)
                a['clearSec'].append(e.get('sec', 0))
            elif ev == 'gameover':
                open_key = None
                a['gameovers'] += 1
            elif ev in ('boss', 'midboss'):
                b = a[ev]
                b['n'] += 1
                b['defeated'] += e.get('result') == 'defeated'
                b['sec'].append(e.get('sec', 0))
        elif ev == 'fps':
            fps.append(e)
    # the attempt running when the time was up is unfinished: leave it out of the clear rate
    if open_key and open_key in agg:
        agg[open_key]['attempts'] -= 1
        agg[open_key]['unfinished'] = 1
    flags = []
    hidden = [e for e in events if e.get('ev') == 'visibility' and e.get('state') == 'hidden']
    if hidden:
        flags.append(f'途中でアプリが {len(hidden)} 回裏に回った（画面消灯・アプリ切り替え・本体の開閉など）。その間ゲームは一時停止')
    for k, a in sorted(agg.items()):
        diff, st = k.split('/')
        n = max(1, a['attempts'])
        rate = a['clears'] / n
        dpa = a['deaths'] / n
        if diff in ('easy', 'normal') and a['attempts'] >= 1 and rate < 0.5 and a['clears'] + a['gameovers'] > 0:
            flags.append(f'{k}: クリア率 {rate:.0%}（{a["clears"]}/{a["attempts"]}）。{diff.upper()} にしては難しすぎる可能性')
        if diff == 'normal' and dpa > 2.5:
            flags.append(f'{k}: 1回の挑戦あたり平均 {dpa:.1f} 回死亡')
        if a['deaths'] >= 4:
            top, cnt = max(a['causes'].items(), key=lambda x: x[1])
            if cnt / a['deaths'] >= 0.4:
                flags.append(f'{k}: 死亡の {cnt / a["deaths"]:.0%} が「{top}」に集中')
        for name, label in (('boss', 'ボス'), ('midboss', '中ボス')):
            b = a[name]
            if b['n'] and b['defeated'] < b['n']:
                flags.append(f'{k}: {label}を {b["n"] - b["defeated"]}/{b["n"]} 回倒しきれず逃げられた')
            if b['sec']:
                avg = sum(b['sec']) / len(b['sec'])
                if name == 'boss' and avg > 120:
                    flags.append(f'{k}: ボス戦が平均 {avg:.0f} 秒と長い')
                if name == 'boss' and avg < 20:
                    flags.append(f'{k}: ボス戦が平均 {avg:.0f} 秒と短い')
                if name == 'midboss' and avg > 45:
                    flags.append(f'{k}: 中ボス戦が平均 {avg:.0f} 秒と長い')
    for st in sorted({k.split('/')[1] for k in agg}):
        n, h = agg.get(f'normal/{st}'), agg.get(f'hard/{st}')
        if n and h and n['attempts'] and h['attempts']:
            if h['clears'] / h['attempts'] > n['clears'] / n['attempts'] + 0.01 or h['deaths'] / h['attempts'] + 0.3 < n['deaths'] / n['attempts']:
                flags.append(f'ステージ{st}: HARD の方が NORMAL より楽な結果（難易度の逆転）')
    fps_summary = {}
    if fps:
        fps_summary = {'avg': round(sum(f['avg'] for f in fps) / len(fps), 1), 'worstP5': min(f['p5'] for f in fps), 'worstMin': min(f['min'] for f in fps)}
        per = {}
        for f in fps:
            per.setdefault(f.get('stage', 0), []).append(f)
        fps_summary['perStage'] = {str(s): {'avg': round(sum(x['avg'] for x in v) / len(v), 1), 'p5': min(x['p5'] for x in v)} for s, v in sorted(per.items())}
        for s, v in fps_summary['perStage'].items():
            if v['p5'] < 50:
                flags.append(f'ステージ{s}: 処理落ち（下位5%のフレームが {v["p5"]} fps）')
    temps = extra.get('temps', [])
    if temps and max(temps) >= 43:
        flags.append(f'端末温度が最高 {max(temps):.1f}℃ まで上昇')
    if extra.get('crashes'):
        flags.append(f'アプリが {extra["crashes"]} 回落ちた（logcat.txt を参照）')
    if extra.get('jserrors'):
        flags.append(f'ページのエラーが {len(extra["jserrors"])} 件（例: {extra["jserrors"][0][:160]}）')
    for v in agg.values():
        for b in (v['boss'], v['midboss']):
            b['avgSec'] = round(sum(b['sec']) / len(b['sec']), 1) if b['sec'] else None
            del b['sec']
        v['avgClearSec'] = round(sum(v['clearSec']) / len(v['clearSec']), 1) if v['clearSec'] else None
        del v['clearSec']
    return agg, fps_summary, flags


def table(agg):
    rows = ['| 難易度/面 | 挑戦 | クリア | 死亡 | 打切 | コンティニュー | ボス 撃破/出現 (平均秒) | 中ボス 撃破/出現 (平均秒) | 主な死因 |',
            '|---|---|---|---|---|---|---|---|---|']
    for k, a in sorted(agg.items(), key=lambda x: (['easy', 'normal', 'hard', 'ordeal'].index(x[0].split('/')[0]) if x[0].split('/')[0] in ['easy', 'normal', 'hard', 'ordeal'] else 9, x[0])):
        causes = ', '.join(f'{c}×{n}' for c, n in sorted(a['causes'].items(), key=lambda x: -x[1])[:3]) or '-'
        b, m = a['boss'], a['midboss']
        bs = f"{b['defeated']}/{b['n']} ({b['avgSec']})" if b['n'] else '-'
        ms = f"{m['defeated']}/{m['n']} ({m['avgSec']})" if m['n'] else '-'
        rows.append(f"| {k} | {a['attempts']} | {a['clears']} | {a['deaths']} | {a['gameovers']} | {a['continues']} | {bs} | {ms} | {causes} |")
    return '\n'.join(rows)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='AETHER LANCE device test runner')
    ap.add_argument('--apk', help='APK to install (default: the newest of dist-apk/ and the repository dist/)')
    ap.add_argument('--edition', choices=['classic', 'hd'], default='classic')
    ap.add_argument('--minutes', type=float, default=60)
    ap.add_argument('--diff', default='normal,hard', help='comma list: easy,normal,hard,ordeal (cycled per pass)')
    ap.add_argument('--stages', default='1-6', help='range and/or list: 1-6, 5, 1,5, 1-3,5')
    ap.add_argument('--speed', type=int, default=1, help='game speed 1..4 (1 = real time; keep 1 to measure fps)')
    ap.add_argument('--vol', type=int, default=3, help='master volume 0..10')
    ap.add_argument('--llm', default='http://localhost:11434', help='local LLM server (Ollama default; LM Studio: http://localhost:1234)')
    ap.add_argument('--model', help='model name (default: the first vision model found, else the first model)')
    ap.add_argument('--no-llm', action='store_true')
    ap.add_argument('--shot-every', type=int, default=300, help='seconds between screenshots (0 = none)')
    ap.add_argument('--serial', help='adb serial when several devices are connected')
    ap.add_argument('--no-install', action='store_true')
    ap.add_argument('--out', help='output folder (default: device-test-<date> next to this project)')
    args = ap.parse_args()

    out = args.out or os.path.join(PROJ, 'device-test-' + dt.datetime.now().strftime('%Y%m%d-%H%M'))
    os.makedirs(os.path.join(out, 'shots'), exist_ok=True)
    adb = Adb(args.serial)
    adb.serial = pick_device(adb)
    info = {
        'model': adb.shell('getprop ro.product.model'), 'maker': adb.shell('getprop ro.product.manufacturer'),
        'android': adb.shell('getprop ro.build.version.release'), 'soc': adb.shell('getprop ro.soc.model') or adb.shell('getprop ro.hardware'),
        'screen': adb.shell('wm size').replace('Physical size: ', ''),
        'ramMB': int(re.search(r'MemTotal:\s+(\d+)', adb.shell('cat /proc/meminfo') or 'MemTotal: 0').group(1)) // 1024,
    }
    say(f"端末: {info['maker']} {info['model']} / Android {info['android']} / {info['soc']} / {info['screen']} / RAM {info['ramMB']} MB")
    pkg = PKG[args.edition]

    if not args.no_install:
        apk = args.apk
        if not apk:
            name = 'AetherLanceHD.apk' if args.edition == 'hd' else 'AetherLance.apk'
            found = [p for p in (os.path.join(PROJ, 'dist-apk', name), os.path.join(REPO, 'dist', name)) if os.path.isfile(p)]
            if not found:
                sys.exit(f'{name} が見つかりません。--apk で指定してください。')
            apk = max(found, key=os.path.getmtime)
        say(f'インストール中: {apk}')
        r = adb.run('install', '-r', apk, timeout=300)
        if 'Success' not in r:
            sys.exit('インストールに失敗しました:\n' + r)

    llm = None
    if not args.no_llm:
        llm = LLM(args.llm, args.model)
        if llm.ok:
            say(f'ローカル LLM: {llm.kind} {llm.model}' + ('（画像も確認）' if llm.vision else '（文字のみ。画像の確認は省略）'))
        else:
            say(f'ローカル LLM に接続できません（{args.llm}）。数値の集計だけ行います。')
            llm = None

    # start the test
    q = f'autotest={args.minutes:g}&diff={args.diff}&stages={args.stages}&speed={args.speed}&vol={args.vol}'
    adb.shell('input keyevent KEYCODE_WAKEUP')
    adb.run('logcat', '-c')
    adb.shell(f'am force-stop {pkg}')
    time.sleep(1)
    adb.shell(f"am start -n {pkg}/{ACTIVITY} --es query '{q}'")
    t0 = time.time()
    deadline = t0 + args.minutes * 60 + 240
    say(f'自動テスト開始: {args.minutes:g} 分 / 難易度 {args.diff} / ステージ {args.stages} / 速度 {args.speed}')

    events, jserrors, temps, shots = [], [], [], []
    state = {'done': False, 'crashes': 0, 'last_ev': time.time(), 'restarts': 0}
    lock = threading.Lock()
    evf = open(os.path.join(out, 'events.jsonl'), 'w', encoding='utf-8')
    logf = open(os.path.join(out, 'logcat.txt'), 'w', encoding='utf-8')
    lc = subprocess.Popen(adb.cmd('logcat', '-v', 'time', 'AetherLance:V', 'AndroidRuntime:E', 'ActivityManager:W', 'chromium:E', 'DEBUG:F', '*:S'),
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    names = {'normal': 'NORMAL', 'hard': 'HARD', 'easy': 'EASY', 'ordeal': 'ORDEAL'}

    def reader():
        for raw in lc.stdout:
            line = raw.decode('utf-8', 'replace').rstrip()
            logf.write(line + '\n')
            i = line.find('ALTEST ')
            if i >= 0:
                try:
                    e = json.loads(line[i + 7:])
                except ValueError:
                    continue
                e['_t'] = round(time.time() - t0, 1)
                with lock:
                    events.append(e)
                    state['last_ev'] = time.time()
                evf.write(json.dumps(e, ensure_ascii=False) + '\n')
                evf.flush()
                ev = e.get('ev')
                d = names.get(e.get('diff'), e.get('diff'))
                if ev == 'start':
                    say(f"▶ ST{e['stage']} {d} {e['weapon'].upper()} Lv{e['lv']} ドローン{e['drones']}")
                elif ev == 'death':
                    say(f"  ✕ 死亡 ST{e['stage']} {e['sec']}秒 原因={e['cause']} ({e['phase']}) 残機{e['lives']}")
                elif ev in ('boss', 'midboss'):
                    say(f"  {'◎' if e['result'] == 'defeated' else '△'} {'ボス' if ev == 'boss' else '中ボス'} {'撃破' if e['result'] == 'defeated' else '逃走'} {e['sec']}秒")
                elif ev == 'clear':
                    say(f"  ★ ST{e['stage']} クリア {e['sec']}秒 死亡{e['deaths']} コンティニュー{e['continues']}")
                elif ev == 'gameover':
                    say(f"  ■ ST{e['stage']} 打ち切り（3回コンティニューしても進めず）")
                elif ev == 'fps':
                    say(f"  fps 平均{e['avg']} 下位5%{e['p5']} 最低{e['min']} (ST{e['stage']})")
                elif ev == 'visibility':
                    say('  ‖ アプリが裏に回りました（一時停止）' if e.get('state') == 'hidden' else '  ▷ アプリが前面に戻りました（再開）')
                elif ev == 'done':
                    state['done'] = True
            elif 'JSERR' in line:
                jserrors.append(line)
                say('  ! ページのエラー: ' + line[line.find('JSERR') + 6:][:200])
            elif 'FATAL' in line or 'has died' in line or ('Process ' + pkg) in line and 'died' in line:
                say('  ! ' + line[:200])
        logf.flush()

    threading.Thread(target=reader, daemon=True).start()

    def review_shot(path, png, at):
        try:
            text = llm.ask(SHOT_PROMPT, png)
        except Exception as ex:  # noqa: BLE001
            text = f'(LLM エラー: {ex})'
        with lock:
            shots.append({'file': os.path.basename(path), 't': at, 'review': text})
        if text and '問題なし' not in text:
            say(f'  LLM（画面 {os.path.basename(path)}）: ' + text.replace('\n', ' / ')[:300])

    next_shot = t0 + 45
    next_poll = t0 + 30
    try:
        while time.time() < deadline and not state['done']:
            time.sleep(2)
            tnow = time.time()
            if tnow >= next_poll:
                next_poll = tnow + 30
                bat = adb.shell('dumpsys battery')
                m = re.search(r'temperature:\s*(\d+)', bat)
                if m:
                    temps.append(int(m.group(1)) / 10)
                if not adb.shell(f'pidof {pkg}'):
                    state['crashes'] += 1
                    remain = max(1, int((deadline - 240 - tnow) / 60))
                    say(f'  ! アプリが停止しています。再起動します（残り {remain} 分）')
                    logf.write(adb.run('logcat', '-d', '-b', 'crash') + '\n')
                    adb.shell('input keyevent KEYCODE_WAKEUP')
                    q2 = re.sub(r'autotest=[^&]+', f'autotest={remain}', q)
                    adb.shell(f"am start -n {pkg}/{ACTIVITY} --es query '{q2}'")
                elif tnow - state['last_ev'] > 600:
                    say('  ! 10分間なにも記録がありません（画面が消えた／止まった可能性）')
                    state['last_ev'] = tnow
                el = int((tnow - t0) / 60)
                if el and el % 10 == 0 and (tnow - t0) % 60 < 30:
                    with lock:
                        n_start = sum(1 for e in events if e.get('ev') == 'start')
                        n_clear = sum(1 for e in events if e.get('ev') == 'clear')
                        n_death = sum(1 for e in events if e.get('ev') == 'death')
                    say(f'── {el}分経過: 挑戦 {n_start} / クリア {n_clear} / 死亡 {n_death}' + (f' / 温度 {temps[-1]}℃' if temps else ''))
            if args.shot_every and tnow >= next_shot:
                next_shot = tnow + args.shot_every
                png = adb.raw('exec-out', 'screencap', '-p', timeout=30)
                if png[:4] == b'\x89PNG':
                    at = round(tnow - t0)
                    path = os.path.join(out, 'shots', f'shot-{at // 60:03d}m{at % 60:02d}s.png')
                    with open(path, 'wb') as f:
                        f.write(png)
                    if llm and llm.vision:
                        threading.Thread(target=review_shot, args=(path, png, at), daemon=True).start()
    except KeyboardInterrupt:
        say('中断しました。ここまでの結果でレポートを作ります。')
    time.sleep(3)
    lc.terminate()
    evf.close()

    with lock:
        evs = list(events)
    agg, fps_summary, flags = summarize(evs, {'temps': temps, 'crashes': state['crashes'], 'jserrors': jserrors})
    summary = {'device': info, 'edition': args.edition, 'minutes': args.minutes, 'diff': args.diff, 'speed': args.speed,
               'perStage': agg, 'fps': fps_summary, 'battery': {'max': max(temps) if temps else None, 'min': min(temps) if temps else None},
               'crashes': state['crashes'], 'jsErrors': jserrors[:20], 'flags': flags, 'completed': state['done']}
    with open(os.path.join(out, 'summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    review = ''
    if llm:
        say('ローカル LLM にバランスの所見をまとめてもらっています…')
        compact = json.dumps({'perStage': agg, 'fps': fps_summary, 'battery': summary['battery']}, ensure_ascii=False)
        try:
            review = llm.ask(REVIEW_PROMPT.format(minutes=args.minutes, summary=compact, flags='\n'.join('- ' + x for x in flags) or '- なし'))
        except Exception as ex:  # noqa: BLE001
            review = f'(LLM エラー: {ex})'
        for _ in range(60):  # let pending screenshot reviews finish
            if all(s.get('review') for s in shots):
                break
            time.sleep(2)

    md = [f"# AETHER LANCE 実機テスト結果（{dt.datetime.now().strftime('%Y-%m-%d %H:%M')}）", '',
          f"- 端末: {info['maker']} {info['model']} / Android {info['android']} / {info['soc']} / {info['screen']} / RAM {info['ramMB']} MB",
          f"- 版: {args.edition} / 時間: {args.minutes:g} 分（{'完走' if state['done'] else '途中まで'}）/ 難易度: {args.diff} / 速度: {args.speed}",
          f"- FPS: 平均 {fps_summary.get('avg', '-')} / 最悪の下位5% {fps_summary.get('worstP5', '-')} / 最低 {fps_summary.get('worstMin', '-')}",
          f"- 端末温度: 最高 {summary['battery']['max']}℃ / クラッシュ {state['crashes']} 回 / ページのエラー {len(jserrors)} 件", '',
          '## ステージ別', '', table(agg), '']
    if fps_summary.get('perStage'):
        md += ['## ステージ別 FPS', '', '| 面 | 平均 | 下位5% |', '|---|---|---|']
        md += [f"| {s} | {v['avg']} | {v['p5']} |" for s, v in fps_summary['perStage'].items()]
        md += ['']
    md += ['## 自動検出した気になる点', ''] + ([f'- {x}' for x in flags] or ['- なし']) + ['']
    if review:
        md += [f'## ローカル LLM の所見（{llm.model}）', '', review, '']
    if shots:
        md += ['## 画面チェック（ローカル LLM）', '']
        md += [f"- {s['file']}（{s['t'] // 60}分{s['t'] % 60}秒）: {(s.get('review') or '-').replace(chr(10), ' / ')}" for s in sorted(shots, key=lambda s: s['t'])]
        md += ['']
    with open(os.path.join(out, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(md))
    say(f'完了。レポート: {os.path.join(out, "report.md")}')
    print('\n'.join(md[:12 + len(agg)]))


if __name__ == '__main__':
    main()
