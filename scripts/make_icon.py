#!/usr/bin/env python3
"""產生 app 圖示：assets/icon-1024.png 與 assets/icon.icns（macOS 的 iconutil）。

圖案：括號樹（經文結構分析的標誌）——左邊是巢狀的直角括號，右邊是一行一行的經文，
金色的那一行是「主句」。底是深藍的 macOS 風格圓角方塊（superellipse）。
用法：python3 scripts/make_icon.py
"""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

S = 4  # 超取樣倍率：先用 4 倍大小畫，再縮小，邊緣才會平滑
N = 1024 * S

def squircle_mask(size, box, n=5.0):
    """macOS 圖示的圓角方塊其實是 superellipse（|x|^n + |y|^n = 1）。"""
    x0, y0, x1, y1 = box
    cx, cy, a, b = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    pts = []
    for i in range(720):
        t = 2 * math.pi * i / 720
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + a * math.copysign(abs(c) ** (2 / n), c), cy + b * math.copysign(abs(s) ** (2 / n), s)))
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m

def vgrad(size, top, bottom):
    img = Image.new('RGB', (1, size))
    for y in range(size):
        t = y / (size - 1)
        img.putpixel((0, y), tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    return img.resize((size, size))

def main():
    k = S
    box = (100 * k, 100 * k, 924 * k, 924 * k)  # macOS 圖示範本：1024 畫布，圖案 824，四周留白
    mask = squircle_mask(N, box)

    canvas = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    # 陰影
    shadow = Image.new('L', (N, N), 0)
    shadow.paste(mask.point(lambda v: int(v * 0.45)), (0, 12 * k))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * k))
    canvas.paste(Image.new('RGBA', (N, N), (10, 18, 50, 255)), (0, 0), shadow)

    # 底：深藍漸層
    bg = vgrad(N, (46, 84, 190), (22, 36, 104)).convert('RGBA')
    canvas.paste(bg, (0, 0), mask)

    # 上緣的柔光
    gloss = Image.new('RGBA', (N, N), (255, 255, 255, 0))
    gd = ImageDraw.Draw(gloss)
    gd.ellipse((-200 * k, -520 * k, 1224 * k, 420 * k), fill=(255, 255, 255, 34))
    gloss = gloss.filter(ImageFilter.GaussianBlur(60 * k))  # 柔光要有漸層的邊緣，不能有一條硬邊
    gloss.putalpha(Image.composite(gloss.getchannel('A'), Image.new('L', (N, N), 0), mask))
    canvas = Image.alpha_composite(canvas, gloss)

    d = ImageDraw.Draw(canvas)
    W = 26 * k          # 線寬
    white = (255, 255, 255, 245)
    gold = (255, 205, 96, 255)

    def line(x1, y1, x2, y2, col=white, w=W):
        d.line([(x1 * k, y1 * k), (x2 * k, y2 * k)], fill=col, width=w)
        r = w / 2
        for (x, y) in ((x1, y1), (x2, y2)):
            d.ellipse((x * k - r, y * k - r, x * k + r, y * k + r), fill=col)

    ys = [290, 402, 514, 626, 738]            # 五行經文
    bars = [(520, 300), (520, 236), (520, 330), (520, 196), (520, 276)]  # 每一行文字的起點與長度
    for i, (y, (x, ln)) in enumerate(zip(ys, bars)):
        col = gold if i == 2 else (255, 255, 255, 215)  # 第 3 行是「主句」
        d.rounded_rectangle((x * k, (y - 20) * k, (x + ln) * k, (y + 20) * k), radius=20 * k, fill=col)

    # 括號樹（由內往外）
    x_in, x_mid, x_out = 420, 330, 240
    yA = (ys[0] + ys[1]) / 2          # 括號 A（第 1、2 行）的中點
    yB1 = (ys[3] + ys[4]) / 2         # 括號 B1（第 4、5 行）的中點
    yB = (ys[2] + yB1) / 2            # 括號 B（第 3 行與 B1）的中點
    # A
    line(x_in, ys[0], x_in, ys[1]); line(x_in, ys[0], 500, ys[0]); line(x_in, ys[1], 500, ys[1])
    # B1
    line(x_in, ys[3], x_in, ys[4]); line(x_in, ys[3], 500, ys[3]); line(x_in, ys[4], 500, ys[4])
    # B：第 3 行 + B1
    line(x_mid, ys[2], x_mid, yB1); line(x_mid, ys[2], 500, ys[2]); line(x_mid, yB1, x_in, yB1)
    # 最外層：A + B
    line(x_out, yA, x_out, yB); line(x_out, yA, x_in, yA); line(x_out, yB, x_mid, yB)
    # 往左接出去的短線
    line(150, (yA + yB) / 2, x_out, (yA + yB) / 2)

    img = canvas.resize((1024, 1024), Image.LANCZOS)
    os.makedirs('assets', exist_ok=True)
    img.save('assets/icon-1024.png')

    # .icns：macOS 需要的各種尺寸（含 @2x）
    iconset = 'assets/icon.iconset'
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            name = f'icon_{base}x{base}' + ('@2x' if scale == 2 else '') + '.png'
            img.resize((px, px), Image.LANCZOS).save(os.path.join(iconset, name))
    subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', 'assets/icon.icns'], check=True)
    for f in os.listdir(iconset):
        os.remove(os.path.join(iconset, f))
    os.rmdir(iconset)
    print('已輸出 assets/icon-1024.png 與 assets/icon.icns')

if __name__ == '__main__':
    main()
