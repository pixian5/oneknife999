#!/usr/bin/env python3
# 第六批状态效果图标预览生成器：4×3 总览 + 64/32/24/16px 实际尺寸对照。
# 只读最终图，不改动原图；尺寸常量集中在这里，方便接入 HUD 时复核。
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "美术素材-CogView" / "第六批-状态效果图标"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
BG = (8, 9, 11)
PANEL = (19, 21, 25)
GOLD = (205, 169, 100)
GREY = (156, 163, 171)
WHITE = (236, 238, 241)

ITEMS = [
    ("01", "中毒", "毒液骷髅"),
    ("02", "减速", "冰霜铁靴"),
    ("03", "眩晕", "眩晕战盔"),
    ("04", "致盲", "遮目血眼"),
    ("05", "破甲", "熔裂铁盾"),
    ("06", "灼烧", "腾起烈焰"),
    ("07", "流血", "滴血匕首"),
    ("08", "冰冻", "六角冰晶"),
    ("09", "护盾", "狮首金盾"),
    ("10", "治疗", "藤蔓生命十字"),
    ("11", "狂暴", "赤红兽首"),
    ("12", "疾行", "翼靴风痕"),
]


def font(size: int, bold: bool = False):
    """加载中文字体；缺失时退回默认字体，避免脚本直接崩溃。"""
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def files():
    """按固定编号取文件，避免 glob 顺序在不同文件系统上不一致。"""
    result = []
    for index, name, detail in ITEMS:
        matches = sorted(OUT.glob(f"{index}-*.jpg"))
        if len(matches) != 1:
            raise SystemExit(f"{index} 匹配到 {len(matches)} 个文件")
        result.append((index, name, detail, matches[0]))
    return result


def make_contact_sheet(items):
    """4×3 总览：每格 512px 图 + 编号、状态名、中心符号说明。"""
    cell_w, cell_h, pad = 512, 600, 24
    sheet = Image.new("RGB", (cell_w * 4 + pad * 5, cell_h * 3 + pad * 4), BG)
    draw = ImageDraw.Draw(sheet)
    label_font = font(28)
    name_font = font(34, bold=True)
    for i, (index, name, detail, path) in enumerate(items):
        col, row = i % 4, i // 4
        x = pad + col * (cell_w + pad)
        y = pad + row * (cell_h + pad)
        draw.rounded_rectangle((x, y, x + cell_w, y + cell_h), 12, fill=PANEL, outline=(48, 42, 32), width=2)
        thumb = Image.open(path).convert("RGB").resize((cell_w, cell_w), Image.LANCZOS)
        sheet.paste(thumb, (x, y))
        draw.text((x + 16, y + cell_w + 12), f"{index}  {name}", font=label_font, fill=GOLD)
        draw.text((x + 16, y + cell_w + 50), detail, font=name_font, fill=WHITE)
    out = OUT / "总览-12张.jpg"
    sheet.save(out, quality=92, optimize=True)
    print("总览", out, sheet.size)


def make_size_sheet(items):
    """12 列 × 4 行：64/32/24/16px 的 1:1 对照，左侧标尺寸。"""
    sizes = [64, 32, 24, 16]
    cell_w, row_h, left = 92, 104, 126
    sheet = Image.new("RGB", (left + cell_w * len(items), row_h * len(sizes) + 42), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 10), "实际尺寸 1:1", font=font(24, bold=True), fill=GOLD)
    for r, size in enumerate(sizes):
        y = 42 + r * row_h
        draw.text((16, y + row_h // 2 - 14), f"{size}px", font=font(22, bold=True), fill=WHITE)
        for c, (_, _, _, path) in enumerate(items):
            x = left + c * cell_w
            draw.rounded_rectangle((x, y, x + cell_w - 8, y + row_h - 8), 6, fill=PANEL)
            thumb = Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS)
            sheet.paste(thumb, (x + (cell_w - 8 - size) // 2, y + (row_h - 8 - size) // 2))
    for c, (index, _, _, _) in enumerate(items):
        draw.text((left + c * cell_w + 28, 16), index, font=font(18), fill=GREY)
    out = OUT / "实际尺寸对照.jpg"
    sheet.save(out, quality=94, optimize=True)
    print("尺寸对照", out, sheet.size)


if __name__ == "__main__":
    items = files()
    make_contact_sheet(items)
    make_size_sheet(items)
