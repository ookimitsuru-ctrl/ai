#!/usr/bin/env python3
"""Export the design spec (docs/README.md + 01..11) as one plain-text file.

usage: python3 scripts/spec-to-txt.py [out.txt]
Headings become ■/◆ lines, links keep their text, code blocks are indented, emphasis markers are dropped.
"""
import os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'AETHER_LANCE_仕様書.txt')
ORDER = ['README.md'] + sorted(f for f in os.listdir(DOCS) if re.match(r'\d\d_.*\.md$', f))

def inline(s):
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: m.group(1) if (m.group(2).startswith('#') or '.md' in m.group(2)) else f'{m.group(1)}（{m.group(2)}）', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'\1', s)
    s = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'\1', s)
    s = re.sub(r'`([^`]+)`', r'\1', s)
    s = s.replace('<br>', ' / ').replace('\\|', '｜')
    return s

def convert(md):
    out, in_code = [], False
    for line in md.splitlines():
        if line.strip().startswith('```'):
            in_code = not in_code
            out.append('    ' + '-' * 40 if in_code else '    ' + '-' * 40)
            continue
        if in_code:
            out.append('    ' + line)
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            lvl, text = len(m.group(1)), inline(m.group(2)).strip()
            if lvl == 1:
                out += ['', '=' * 72, text, '=' * 72]
            elif lvl == 2:
                out += ['', '■ ' + text, '-' * 72]
            elif lvl == 3:
                out += ['', '◆ ' + text]
            else:
                out += ['', '・' + text]
            continue
        if re.match(r'^\s*\|?\s*:?-{3,}', line) and '|' in line:
            out.append(re.sub(r'[^|]', '-', line.strip()))
            continue
        if re.match(r'^\s*-{3,}\s*$', line):
            out.append('')
            continue
        line = re.sub(r'^(\s*)[-*]\s+', lambda m: m.group(1) + '・', line)
        line = re.sub(r'^>\s?', '  ', line)
        out.append(inline(line))
    text = '\n'.join(out)
    return re.sub(r'\n{3,}', '\n\n', text).strip() + '\n'

parts = []
toc = []
for i, f in enumerate(ORDER):
    md = open(os.path.join(DOCS, f), encoding='utf-8').read()
    first = re.search(r'^#\s+(.*)$', md, re.M)
    toc.append(f'  {i:02d}. {inline(first.group(1)) if first else f}')
    parts.append(convert(md))

head = [
    'AETHER LANCE（エーテルランス） 制作指示書（仕様書）',
    f'書き出し日: {datetime.date.today().isoformat()}　元ファイル: aether-lance/docs/*.md',
    '',
    '目次',
    *toc,
    '',
]
with open(OUT, 'w', encoding='utf-8-sig', newline='\r\n') as fo:
    fo.write('\n'.join(head) + '\n' + '\n'.join(parts))
print('wrote', OUT)
