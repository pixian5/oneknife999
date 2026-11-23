#!/usr/bin/env python3
# 第六批状态图标透明化：把 CogView 黑底方图裁成圆形徽章并导出 128px PNG。
# 不使用 rembg/u2net，纯 PIL 圆形蒙版，避免额外模型下载；只处理已验收的 5 张已有状态图标。
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "美术素材-CogView" / "第六批-状态效果图标"
OUT = ROOT / "game" / "assets"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

# 每张图手工给一个正方形裁切框，先把不同徽章直径拉齐，再做圆形 alpha。
# 04 的徽章本身比其它图小一圈，单独裁得更紧；03 顶部有星轨尖角，保留整高。
# 03/05 原图整体偏暗，32/26px 下几乎看不清，单独提亮；其余保持原色。
ITEMS = [
    ("status-poison", "01-状态-中毒.jpg", (36, 36, 988, 988), 1.0, 1.0),
    ("status-slow", "02-状态-减速.jpg", (36, 32, 988, 984), 1.0, 1.0),
    ("status-stun", "03-状态-眩晕.jpg", (12, 0, 1012, 1000), 1.55, 1.1),
    ("status-blind", "04-状态-致盲.jpg", (80, 84, 940, 940), 1.0, 1.0),
    ("status-armor-break", "05-状态-破甲.jpg", (36, 36, 988, 988), 1.5, 1.08),
]


def circular_alpha(size: int, feather: int = 3) -> Image.Image:
    """生成 4× 超采样圆形蒙版，再缩到目标尺寸，避免椭圆边缘锯齿。"""
    big = size * 4
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((feather * 4, feather * 4, big - feather * 4, big - feather * 4), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def font(size: int):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def build_icon(slug: str, filename: str, box, brightness: float, contrast: float):
    """裁切 → 提亮 → 128px → 圆形 alpha → 保存 PNG。"""
    source = ART / filename
    image = Image.open(source).convert("RGB").crop(box).resize((128, 128), Image.LANCZOS)
    image = ImageEnhance.Brightness(image).enhance(brightness)
    image = ImageEnhance.Contrast(image).enhance(contrast)
    alpha = circular_alpha(128, feather=3)
    image = image.convert("RGBA")
    image.putalpha(alpha)
    target = OUT / f"{slug}.png"
    image.save(target, optimize=True)
    return target


def checkerboard(size: int, cell: int = 8, dark=(30, 32, 36), light=(52, 56, 62)) -> Image.Image:
    """透明底检查棋盘格，用来确认圆形外没有残留黑角。"""
    sheet = Image.new("RGB", (size, size), dark)
    draw = ImageDraw.Draw(sheet)
    for y in range(0, size, cell):
        for x in range(0, size, cell):
            if (x // cell + y // cell) % 2 == 0:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=light)
    return sheet


def build_preview(paths):
    """输出 5 枚图标的透明底 64/32px 预览，方便肉眼确认。"""
    cell_w, cell_h, pad = 180, 190, 20
    sheet = Image.new("RGB", (cell_w * 5 + pad * 2, cell_h * 2 + pad * 3), (12, 14, 18))
    draw = ImageDraw.Draw(sheet)
    for row, size in enumerate((64, 32)):
        y = pad + row * (cell_h + pad)
        draw.text((pad, y - 2), f"{size}px", font=font(18), fill=(205, 169, 100))
        for col, (slug, source, box, brightness, contrast) in enumerate(ITEMS):
            x = pad + col * cell_w
            bg = checkerboard(size)
            icon = Image.open(paths[col]).convert("RGBA")
            # 用 LANCZOS 缩到实际尺寸，保留 alpha 边缘
            icon = icon.resize((size, size), Image.LANCZOS)
            bg.paste(icon, (0, 0), icon)
            sheet.paste(bg, (x, y + 24))
            draw.text((x, y + 24 + size + 8), slug.replace("status-", ""), font=font(16), fill=(230, 232, 236))
    out = ART / "透明底预览.jpg"
    sheet.save(out, quality=94, optimize=True)
    print("透明底预览", out, sheet.size)


if __name__ == "__main__":
    paths = []
    for slug, filename, box, brightness, contrast in ITEMS:
        path = build_icon(slug, filename, box, brightness, contrast)
        paths.append(path)
        print(slug, path, Image.open(path).size, Image.open(path).mode, f"{path.stat().st_size / 1024:.1f}KB")
    build_preview(paths)
