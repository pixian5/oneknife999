#!/usr/bin/env python3
# 第五批套装/品质徽记预览生成器：总览 + 64/32/16px 实际尺寸对照。
# 仅读取同目录最终图，不改动原图；所有尺寸来自常量，方便后续接入 UI 时复核。
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "美术素材-CogView" / "第五批-套装与品质徽记"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
BG = (12, 14, 18)
PANEL = (22, 24, 30)
GOLD = (205, 169, 100)
GREY = (160, 166, 174)
WHITE = (236, 238, 241)

ITEMS = [
    ("01", "套装·边境", "苍狼徽记"),
    ("02", "套装·苍月", "潮月徽记"),
    ("03", "套装·龙脉", "龙脊徽记"),
    ("04", "套装·冰封", "霜冠徽记"),
    ("05", "套装·烬火", "焚心徽记"),
    ("06", "套装·帝陵", "帝玺徽记"),
    ("07", "品质·白", "素纹徽章"),
    ("08", "品质·蓝", "澄辉徽章"),
    ("09", "品质·紫", "渊晶徽章"),
    ("10", "品质·橙", "熔金徽章"),
    ("11", "品质·红", "赤煞徽章"),
    ("12", "品质·金", "天冕徽章"),
]


def font(size: int, bold: bool = False):
    """加载中文字体；失败时退回默认字体，避免脚本因环境缺字体直接崩。"""
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def files():
    """按固定编号取文件，禁止用 glob 顺序猜文件名。"""
    result = []
    for index, group, name in ITEMS:
        matches = sorted(OUT.glob(f"{index}-*.jpg"))
        if len(matches) != 1:
            raise SystemExit(f"{index} 匹配到 {len(matches)} 个文件")
        result.append((index, group, name, matches[0]))
    return result


def make_contact_sheet(items):
    """4×3 总览：每格 512px 图 + 编号、套装/品质、徽记名。"""
    cell_w, cell_h, pad = 512, 600, 24
    sheet = Image.new("RGB", (cell_w * 4 + pad * 5, cell_h * 3 + pad * 4), BG)
    draw = ImageDraw.Draw(sheet)
    label_font = font(28)
    name_font = font(34, bold=True)
    for i, (index, group, name, path) in enumerate(items):
        col, row = i % 4, i // 4
        x = pad + col * (cell_w + pad)
        y = pad + row * (cell_h + pad)
        draw.rounded_rectangle((x, y, x + cell_w, y + cell_h), 12, fill=PANEL, outline=(48, 42, 32), width=2)
        thumb = Image.open(path).convert("RGB").resize((cell_w, cell_w), Image.LANCZOS)
        sheet.paste(thumb, (x, y))
        draw.text((x + 16, y + cell_w + 12), f"{index}  {group}", font=label_font, fill=GOLD)
        draw.text((x + 16, y + cell_w + 50), name, font=name_font, fill=WHITE)
    out = OUT / "总览-12张.jpg"
    sheet.save(out, quality=92, optimize=True)
    print("总览", out, sheet.size)


def make_size_sheet(items):
    """12 列 × 3 行：64px、32px、16px 的 1:1 对照，左侧标尺寸。"""
    sizes = [64, 32, 16]
    cell_w, row_h, left = 92, 104, 126
    sheet = Image.new("RGB", (left + cell_w * len(items), row_h * 3 + 42), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 10), "实际尺寸 1:1", font=font(24, bold=True), fill=GOLD)
    for r, size in enumerate(sizes):
        y = 42 + r * row_h
        draw.text((16, y + row_h // 2 - 14), f"{size}px", font=font(22, bold=True), fill=WHITE)
        for c, (index, _, _, path) in enumerate(items):
            x = left + c * cell_w
            draw.rounded_rectangle((x, y, x + cell_w - 8, y + row_h - 8), 6, fill=PANEL)
            thumb = Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS)
            sheet.paste(thumb, (x + (cell_w - 8 - size) // 2, y + (row_h - 8 - size) // 2))
    # 编号列，避免 12 列在缩略后无法对应总览。
    for c, (index, _, _, _) in enumerate(items):
        draw.text((left + c * cell_w + 28, 16), index, font=font(18), fill=GREY)
    out = OUT / "实际尺寸对照.jpg"
    sheet.save(out, quality=94, optimize=True)
    print("尺寸对照", out, sheet.size)


if __name__ == "__main__":
    items = files()
    make_contact_sheet(items)
    make_size_sheet(items)
