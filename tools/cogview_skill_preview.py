#!/usr/bin/env python3
# 第三批技能图标预览：总览图 + 桌面 23px / 移动端 19px 的 1:1 实际尺寸对照。
# 只读取技能图标目录，不改动原图；用于判断缩到技能栏后是否还能分清 12 个技能。
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FOLDER = Path("美术素材-CogView/第三批-技能图标")
# 05 原图生成了带人物的施法者，最终预览改用补拍目录里的孤立雷矛版本。
OVERRIDES = {5: FOLDER / "补拍" / "05b-法师-雷矛术-孤立雷矛.jpg", 7: FOLDER / "补拍" / "07c-法师-烈焰震环-半球爆焰.jpg"}
CLASS_COLORS = {1: (241, 170, 90), 2: (120, 182, 236), 3: (168, 140, 227)}
SKILL_NAMES = {
    1: "破甲斩",
    2: "旋风扫",
    3: "震地冲",
    4: "焚天斩",
    5: "雷矛术",
    6: "焰痕地带",
    7: "烈焰震环",
    8: "天火陨星",
    9: "蚀骨咒",
    10: "召唤骨卫",
    11: "生息法阵",
    12: "镇魂符",
}


def font(size: int, bold: bool = False):
    """加载中文字体。"""
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def load_items():
    """读取 01–12 的 12 张技能图标，并按数字分配职业颜色。"""
    files = sorted((p for p in FOLDER.glob("*.jpg") if re.match(r"^\d{2}-", p.name)), key=lambda p: p.name)
    items = []
    for path in files:
        index = int(path.name[:2])
        path = OVERRIDES.get(index, path)
        if 1 <= index <= 4:
            hero = "战士"
        elif 5 <= index <= 8:
            hero = "法师"
        else:
            hero = "道士"
        items.append({"index": index, "path": path, "name": SKILL_NAMES[index], "hero": hero})
    if len(items) != 12:
        raise SystemExit(f"期望 12 张，实际 {len(items)} 张")
    return items


def contact_sheet(items, target: Path):
    """4×3 总览，保留 1024 原图比例。"""
    columns, rows = 4, 3
    cell_w, cell_h = 520, 620
    canvas = Image.new("RGB", (columns * cell_w, rows * cell_h + 90), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 22), "CogView-3-Flash 三职业技能图标 · 12 张总览", font=font(34, True), fill=(238, 226, 205))
    draw.text((32, 68), "战士 1–4 ｜ 法师 5–8 ｜ 道士 9–12；免费模型右下角 AI生成 水印未去除", font=font(20), fill=(168, 156, 176))
    for i, item in enumerate(items):
        col, row = i % columns, i // columns
        x, y = col * cell_w, 90 + row * cell_h
        image = Image.open(item["path"]).convert("RGB")
        thumb = ImageOps.contain(image, (cell_w - 40, cell_h - 80), Image.LANCZOS)
        canvas.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 10))
        color = CLASS_COLORS[{"战士": 1, "法师": 2, "道士": 3}[item["hero"]]]
        draw.text((x + 22, y + cell_h - 55), f"{item['index']:02d}  {item['name']}", font=font(26, True), fill=color)
        draw.text((x + 22, y + cell_h - 24), item["hero"], font=font(18), fill=(150, 140, 160))
    canvas.save(target, quality=92, subsampling=0)
    return target


def actual_size_sheet(items, target: Path):
    """按技能栏 23px / 移动端 19px 绘制 1:1 像素行，另附 4× 放大参考。"""
    canvas = Image.new("RGB", (1800, 960), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 28), "技能图标实际尺寸对照（像素 1:1）", font=font(38, True), fill=(238, 226, 205))
    draw.text(
        (38, 76),
        "桌面图标 23×23px（按钮约 44px）｜ 移动端图标 19×19px（按钮约 38px）｜ 下方 4× 放大仅用于辨认细节。",
        font=font(21),
        fill=(168, 156, 176),
    )

    def draw_row(y, size, button, title):
        draw.text((36, y), title, font=font(24, True), fill=(220, 205, 230))
        for i, item in enumerate(items):
            x = 340 + i * 115
            # 先画技能按钮底色，再把 23/19px 图标按 1:1 居中贴入，模拟真实技能栏观感。
            button_x, button_y = x - (button - size) // 2, y + 4
            draw.rounded_rectangle(
                (button_x - 1, button_y - 1, button_x + button, button_y + button),
                radius=5,
                fill=(28, 24, 30),
                outline=(126, 94, 56),
                width=1,
            )
            image = Image.open(item["path"]).convert("RGB").resize((size, size), Image.LANCZOS)
            canvas.paste(image, (x, y + 4))
            draw.text((x - 18, y + button + 14), item["name"], font=font(17, True), fill=CLASS_COLORS[{"战士": 1, "法师": 2, "道士": 3}[item["hero"]]])

    draw_row(140, 23, 44, "桌面技能栏 23px")
    draw_row(280, 19, 38, "移动端技能栏 19px")

    draw.text((36, 420), "4× 放大参考（92px）", font=font(24, True), fill=(220, 205, 230))
    for i, item in enumerate(items):
        col, row = i % 6, i // 6
        x, y = 340 + col * 240, 450 + row * 250
        image = Image.open(item["path"]).convert("RGB").resize((92, 92), Image.LANCZOS)
        canvas.paste(image, (x, y))
        draw.rectangle((x - 2, y - 2, x + 93, y + 93), outline=(82, 72, 92))
        draw.text((x, y + 100), f"{item['index']:02d} {item['name']}", font=font(17, True), fill=(214, 202, 226))
        draw.text((x, y + 122), item["hero"], font=font(15), fill=(150, 140, 160))

    canvas.save(target, quality=92, subsampling=0)
    return target


def main():
    items = load_items()
    contact = contact_sheet(items, FOLDER / "总览-12张.jpg")
    actual = actual_size_sheet(items, FOLDER / "实际尺寸对照.jpg")
    (FOLDER / "预览清单.json").write_text(
        json.dumps(
            {
                "count": len(items),
                "contact_sheet": str(contact),
                "actual_size_sheet": str(actual),
                "actual_sizes": {"desktop": 23, "mobile": 19, "zoom_reference": 92},
                "items": [{"file": str(i["path"]), "name": i["name"], "hero": i["hero"]} for i in items],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"总览：{contact}")
    print(f"实际尺寸：{actual}")


if __name__ == "__main__":
    main()
