#!/usr/bin/env python3
# 第四批装备/物品图标预览：4×4 总览 + 桌面 46px / 移动 29px 实际尺寸对照。
# 尺寸来自真实页面测量：桌面 .equipment-slot=46px，移动端=28.7~29.5px。
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FOLDER = Path("美术素材-CogView/第四批-装备与物品图标")
GROUP_COLORS = {1: (241, 170, 90), 2: (168, 140, 227), 3: (120, 182, 236)}


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def load_items():
    """优先读取“最终选用.json”映射（含补拍件），否则回退到 01–16 主图。"""
    selection = FOLDER / "最终选用.json"
    if selection.exists():
        data = json.loads(selection.read_text(encoding="utf-8"))
        items = []
        for entry in data["items"]:
            path = FOLDER / entry["file"]
            if not path.exists():
                raise SystemExit(f"最终选用文件缺失：{path}")
            items.append(
                {
                    "index": int(entry["index"]),
                    "path": path,
                    "category": entry["category"],
                    "name": entry["name"],
                    "source": entry.get("source", ""),
                }
            )
        if len(items) != 16:
            raise SystemExit(f"期望 16 张，最终选用清单有 {len(items)} 张")
        return items

    items = []
    for path in sorted(FOLDER.glob("*.jpg"), key=lambda p: p.name):
        if not re.match(r"^\d{2}-", path.name):
            continue
        parts = path.stem.split("-")
        index = int(parts[0])
        category = parts[1] if len(parts) > 1 else ""
        name = parts[-1]
        items.append({"index": index, "path": path, "category": category, "name": name})
    if len(items) != 16:
        raise SystemExit(f"期望 16 张，实际 {len(items)} 张")
    return items


def contact_sheet(items, target):
    """4×4 总览。"""
    columns, rows = 4, 4
    cell_w, cell_h = 500, 600
    canvas = Image.new("RGB", (columns * cell_w, rows * cell_h + 92), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 22), "CogView-3-Flash 深渊装备与物品图标 · 16 张总览", font=font(34, True), fill=(238, 226, 205))
    draw.text((32, 68), "12 个装备槽 + 药水 / 黑铁矿石 / 重铸卷 / 首领印记；JPEG + 强制水印，仅概念稿。", font=font(19), fill=(168, 156, 176))
    for i, item in enumerate(items):
        col, row = i % columns, i // columns
        x, y = col * cell_w, 92 + row * cell_h
        image = Image.open(item["path"]).convert("RGB")
        thumb = ImageOps.contain(image, (cell_w - 40, cell_h - 80), Image.LANCZOS)
        canvas.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 8))
        draw.text((x + 22, y + cell_h - 58), f"{item['index']:02d}  {item['name']}", font=font(25, True), fill=(238, 226, 205))
        draw.text((x + 22, y + cell_h - 26), item["category"], font=font(17), fill=(160, 150, 170))
    canvas.save(target, quality=92, subsampling=0)
    return target


def actual_size_sheet(items, target):
    """桌面 46px / 移动 29px 的 1:1 图标，另附 92px 2× 放大参考。"""
    canvas = Image.new("RGB", (1700, 980), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 26), "装备与物品图标实际尺寸对照（像素 1:1）", font=font(38, True), fill=(238, 226, 205))
    draw.text((38, 72), "真实页面测量：桌面装备格 46px、移动端约 29px；92px 只作 2× 放大参考。", font=font(20), fill=(168, 156, 176))

    def row(y, size, title, per_row=8):
        draw.text((36, y), title, font=font(23, True), fill=(220, 205, 230))
        for i, item in enumerate(items):
            col, r = i % per_row, i // per_row
            x = 330 + col * (size + 58)
            yy = y + r * (size + 62)
            # 装备格底色，尺寸 46/29 时留 5px 边，模拟真实格子。
            draw.rectangle((x - 5, yy - 5, x + size + 4, yy + size + 4), fill=(20, 32, 38), outline=(80, 74, 86))
            image = Image.open(item["path"]).convert("RGB").resize((size, size), Image.LANCZOS)
            canvas.paste(image, (x, yy))
            draw.text((x - 10, yy + size + 10), item["name"], font=font(15, True), fill=(214, 202, 226))

    row(130, 46, "桌面装备格 46px")
    row(380, 29, "移动端装备格 29px")

    draw.text((36, 650), "2× 放大参考（92px）", font=font(23, True), fill=(220, 205, 230))
    for i, item in enumerate(items):
        col, r = i % 8, i // 8
        x, y = 330 + col * 150, 690 + r * 150
        image = Image.open(item["path"]).convert("RGB").resize((92, 92), Image.LANCZOS)
        canvas.paste(image, (x, y))
        draw.rectangle((x - 1, y - 1, x + 92, y + 92), outline=(80, 74, 86))
    canvas.save(target, quality=92, subsampling=0)
    return target


def main():
    items = load_items()
    contact = contact_sheet(items, FOLDER / "总览-16张.jpg")
    actual = actual_size_sheet(items, FOLDER / "实际尺寸对照.jpg")
    (FOLDER / "预览清单.json").write_text(
        json.dumps(
            {
                "count": len(items),
                "contact_sheet": str(contact),
                "actual_size_sheet": str(actual),
                "actual_sizes": {"desktop_equipment_slot": 46, "mobile_equipment_slot": 29, "zoom_reference": 92},
                "items": [
                    {
                        "file": str(i["path"]),
                        "name": i["name"],
                        "category": i["category"],
                        "source": i.get("source", ""),
                    }
                    for i in items
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(contact)
    print(actual)


if __name__ == "__main__":
    main()
