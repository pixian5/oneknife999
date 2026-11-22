#!/usr/bin/env python3
# CogView 概念稿预览生成器：总览图 + 游戏内实际像素尺寸对照。
# 只读概念稿目录，不改动原图；用于判断缩到真实尺寸后的可读性。
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def font(size: int, bold: bool = False):
    """加载中文字体；TTC 默认取第一个字面。"""
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def load_items(folder: Path):
    """按文件名数字前缀排序，返回路线与运行尺寸。"""
    files = sorted((path for path in folder.glob("*.jpg") if re.match(r"^\d{2}-", path.name)), key=lambda path: path.name)
    items = []
    for path in files:
        number = int(path.name.split("-")[0])
        if 1 <= number <= 3:
            group, runtime = "角色 · 战斗内 112px", 112
        elif 4 <= number <= 6:
            group, runtime = "野怪 · 战斗内 110px", 110
        elif 7 <= number <= 8:
            group, runtime = "首领 · 战斗内 210px", 210
        else:
            group, runtime = "图标 · 栏位 128px", 128
        items.append({"path": path, "name": path.stem.split("-", 1)[-1], "group": group, "runtime": runtime})
    return items


def contact_sheet(items, target: Path):
    """生成 4×3 总览：保留原图比例，统一缩略图框，附中文标签。"""
    columns, rows = 4, 3
    cell_w, cell_h = 580, 700
    canvas = Image.new("RGB", (columns * cell_w, rows * cell_h + 80), (14, 12, 18))
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 18), "CogView-3-Flash 深层概念稿第二批 · 12 张总览", font=font(30, True), fill=(238, 226, 205))
    draw.text((24, 55), "免费模型右下角强制 AI生成 水印，未去除；仅作概念稿", font=font(19), fill=(168, 156, 176))
    for index, item in enumerate(items):
        column, row = index % columns, index // columns
        x, y = column * cell_w, 80 + row * cell_h
        image = Image.open(item["path"]).convert("RGB")
        thumb = ImageOps.contain(image, (cell_w - 40, cell_h - 90), Image.LANCZOS)
        canvas.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 10))
        label = f"{item['path'].name.split('-')[0]}  {item['name']}"
        draw.text((x + 24, y + cell_h - 62), label, font=font(28, True), fill=(238, 226, 205))
        draw.text((x + 24, y + cell_h - 30), item["group"], font=font(19), fill=(150, 140, 160))
    canvas.save(target, quality=92, subsampling=0)
    return target


def actual_size_sheet(items, target: Path):
    """按运行时高度绘制 1:1 像素预览，直接看真实游戏里的可读性。"""
    canvas = Image.new("RGB", (1700, 1240), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 30), "游戏内实际尺寸预览（像素 1:1）", font=font(38, True), fill=(238, 226, 205))
    draw.text((38, 78), "角色 112px ｜ 野怪 110px ｜ 首领 210px ｜ 图标 128px。免费模型水印随图缩放，仍保留。", font=font(21), fill=(168, 156, 176))

    rows = [
        ("角色 · 战斗内", [item for item in items if 1 <= int(item["path"].name.split("-")[0]) <= 3], 112, 200, 190),
        ("野怪 · 战斗内", [item for item in items if 4 <= int(item["path"].name.split("-")[0]) <= 6], 110, 420, 190),
        ("首领 · 战斗内", [item for item in items if 7 <= int(item["path"].name.split("-")[0]) <= 8], 210, 610, 290),
        ("图标 · 栏位", [item for item in items if int(item["path"].name.split("-")[0]) >= 9], 128, 940, 200),
    ]
    for title, row_items, runtime, top, height in rows:
        draw.text((36, top + 70), title, font=font(25, True), fill=(220, 205, 230))
        draw.text((36, top + 104), f"高度 {runtime}px", font=font(18), fill=(148, 138, 158))
        cell_w = 300 if runtime < 200 else 380
        for index, item in enumerate(row_items):
            image = Image.open(item["path"]).convert("RGB")
            scale = runtime / image.height
            resized = image.resize((max(1, round(image.width * scale)), runtime), Image.LANCZOS)
            x = 220 + index * cell_w
            y = top + (height - runtime) // 2
            # 用暗色描边框住边界，避免黑底图片与背景融在一起。
            draw.rectangle((x - 3, y - 3, x + resized.width + 2, y + runtime + 2), outline=(82, 72, 92))
            canvas.paste(resized, (x, y))
            draw.text((x, top + height + 4), item["name"], font=font(19, True), fill=(214, 202, 226))
        draw.line((36, top + height + 42, 1660, top + height + 42), fill=(42, 38, 50))

    canvas.save(target, quality=92, subsampling=0)
    return target


def main():
    folder = Path("美术素材-CogView/第二批-深层概念稿")
    items = load_items(folder)
    if len(items) != 12:
        raise SystemExit(f"期望 12 张，实际 {len(items)} 张")
    contact = contact_sheet(items, folder / "总览-12张.jpg")
    actual = actual_size_sheet(items, folder / "实际尺寸预览.jpg")
    manifest = {
        "count": len(items),
        "contact_sheet": str(contact),
        "actual_size_sheet": str(actual),
        "runtime_heights": {"player": 112, "monster": 110, "boss": 210, "icon": 128},
        "items": [{"file": str(item["path"]), "name": item["name"], "group": item["group"]} for item in items],
    }
    (folder / "预览清单.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"总览：{contact}")
    print(f"实际尺寸：{actual}")


if __name__ == "__main__":
    main()
