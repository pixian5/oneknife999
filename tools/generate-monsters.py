#!/usr/bin/env python3
# 0.8.41 CogView 批量生成 46 怪原画（规格书 docs/20261122-0240）：
# 逐怪调 CogView-3-Flash（绿底）→ 下载 → PIL 抠图透明化 → 160×160 存入 game/assets。
# 断点续跑：已存在的跳过；失败记录重试清单。
import json, os, re, sys, time, urllib.request
from PIL import Image
from PIL import Image

API_KEY = os.environ.get("ZHIPU_KEY", "")
OUT = "game/assets"
RAW = "tmp/monster-raw"
os.makedirs(RAW, exist_ok=True)

names = json.load(open("/tmp/monster-names.json"))
spec = open("docs/20261122-0240-46怪原画生成规格书-GLM.md", encoding="utf-8").read()

def prompt_for(name):
    # 从规格书提取该怪的 PROMPT 行（"数字. **基名** — PROMPT: ..."）
    m = re.search(rf'\d+\. \*\*{re.escape(name)}\*\* — PROMPT: (.+)', spec)
    body = m.group(1).strip() if m else f"{name}, dark fantasy monster"
    return body + ", full body single character, centered, solid bright green background #00FF00, dark fantasy MMORPG sprite style, highly detailed, no text, no watermark"

def gen_one(name):
    prompt = prompt_for(name)
    req = urllib.request.Request(
        "https://open.bigmodel.cn/api/paas/v4/images/generations",
        data=json.dumps({"model": "cogview-3-flash", "prompt": prompt, "size": "1024x1024"}).encode(),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        url = json.load(r)["data"][0]["url"]
    raw_path = f"{RAW}/{name}-raw.png"
    urllib.request.urlretrieve(url, raw_path)
    return raw_path

def cutout(raw_path, out_path):
    # 绿底亮度抠图 + 主体裁切 + 160×160
    im = Image.open(raw_path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r + g + b < 150 and g >= r and g >= b:
                px[x, y] = (r, g, b, 0)
            elif g > 90 and g > r * 1.3 and g > b * 1.3:
                px[x, y] = (r, g, b, 0)
    # 裁掉透明边
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # 等比缩放至高度 152（160 留边）
    scale = 152 / im.height
    im = im.resize((max(1, int(im.width * scale)), 152), Image.LANCZOS)
    canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    canvas.paste(im, ((160 - im.width) // 2, 160 - 152), im)
    canvas.save(out_path, "PNG", optimize=True)

import re  # noqa: E402

done, failed = 0, []
for name in names:
    out_path = f"{OUT}/monster-full-{name}.png"
    if os.path.exists(out_path):
        done += 1
        print(f"[跳过] {name} 已存在", flush=True)
        continue
    for attempt in range(3):
        try:
            raw = gen_one(name)
            cutout(raw, out_path)
            done += 1
            print(f"[完成] {name} ({done}/{len(names)})", flush=True)
            break
        except Exception as e:
            print(f"[重试{attempt+1}] {name}: {str(e)[:80]}", flush=True)
            time.sleep(5 * (attempt + 1))
    else:
        failed.append(name)
        print(f"[失败] {name}", flush=True)
    time.sleep(2)  # 限速礼貌间隔

print(f"生成完成：{done}/{len(names)}，失败 {len(failed)}：{failed}")
if failed:
    sys.exit(1)
