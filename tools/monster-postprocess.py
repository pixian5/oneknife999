#!/usr/bin/env python3
# 0.8.41 生成后处理：清除 CogView 免费版右下角"AI生成"水印（alpha 置 0），
# 并逐张做透明占比自检（主体 ≥25% 合格，过低打印警告）。
import os, sys
from PIL import Image

DIR = "game/assets"
names = [n[13:-4] for n in os.listdir(DIR) if n.startswith("monster-full-") and n.endswith(".png")]
# 只处理本轮 46 个新怪（跳过已有旧素材，判定依据：文件是今天新生成的以 G 开头 id 无法区分，改用大小 160x160 且带绿边残留检测）
bad_corners = 0
checked = 0
for name in sorted(names):
    path = f"{DIR}/monster-full-{name}.png"
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    if (w, h) != (160, 160):
        continue
    checked += 1
    px = im.load()
    # 右下角 44×28 区域：非透明像素数量（水印特征区）
    corner = [(x, y) for y in range(h - 28, h) for x in range(w - 44, w) if px[x, y][3] > 60]
    if len(corner) > 20:
        for x, y in corner:
            px[x, y] = (0, 0, 0, 0)
        bad_corners += 1
        im.save(path, "PNG", optimize=True)
    # 0.8.41 边缘绿溢出 defringe：半透明边缘像素的绿色分量压向 r/b 均值（去绿边锯齿）
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 250 and g > (r + b) // 2 + 12:
                px[x, y] = (r, (r + b) // 2 + 6, b, a)
    # 主体占比自检
    alphas = [px[x, y][3] for y in range(0, h, 6) for x in range(0, w, 6)]
    ratio = sum(1 for a in alphas if a > 100) * 100 // len(alphas)
    if ratio < 12:
        print(f"⚠ {name} 主体占比仅 {ratio}%（可能抠图失败，需人工检查）")
    im.save(path, "PNG", optimize=True)
print(f"检查 {checked} 张 160×160 | 清理水印 {bad_corners} 张")
