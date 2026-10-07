#!/usr/bin/env python3
"""驗收項目 1：比對 app 匯出的 PDF 和 LibreOffice 版本（逐行文字的位置）。
用法：python3 scripts/compare_pdf.py ref.pdf app.pdf"""
import re, subprocess, sys, tempfile, os

def words(pdf):
    out = tempfile.mktemp(suffix='.html')
    subprocess.run(['pdftotext', '-bbox', pdf, out], check=True)
    ws = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(out).read()):
        x0, y0, x1, y1 = map(float, m.groups()[:4]); ws.append((x0, y0, x1, y1, m.group(5)))
    os.unlink(out); return ws

greek = lambda w: re.search(r'[Ͱ-Ͽἀ-῿]', w[4])

def lines(ws):
    g = sorted([w for w in ws if greek(w)], key=lambda w: (round(w[1]), w[0]))
    rows = []
    for w in g:
        if rows and abs(rows[-1][0][1] - w[1]) < 2: rows[-1].append(w)
        else: rows.append([w])
    return [(r[0][1], r[0][0], ' '.join(x[4] for x in r)) for r in rows]

ref, app = sys.argv[1], sys.argv[2]
lr, la = lines(words(ref)), lines(words(app))
print(f'行數：ref {len(lr)}／app {len(la)}')
dys, dxs = [], []
for i, (r, a) in enumerate(zip(lr, la)):
    dys.append(a[0] - r[0]); dxs.append(a[1] - r[1])
    print(f'{i+1:2d} dY={a[0]-r[0]:+5.1f}pt dX={a[1]-r[1]:+5.1f}pt  {r[2][:20]}')
mx = lambda v: max(abs(x) for x in v)
print(f'最大偏差：垂直 {mx(dys):.1f}pt（{mx(dys)*25.4/72:.2f}mm）、水平 {mx(dxs):.1f}pt（{mx(dxs)*25.4/72:.2f}mm）')
