#!/usr/bin/env python3
# 第三批补拍对照：04 / 05 / 07 / 08 的原图、重生成与补拍候选，4×3 一页看完。
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BASE = Path("美术素材-CogView")
OLD = BASE / "第二批-深层概念稿"
NEW = BASE / "第三批-技能图标"
FIX = NEW / "补拍"

PANELS = [
    ("04 原版", OLD / "04-深渊帝陵禁卫.jpg", "半身，无武器"),
    ("04d 暗黑全身", FIX / "04d-深渊帝陵禁卫-暗黑全身.jpg", "全身，紫焰头盔"),
    ("04e 暗黑长戟", FIX / "04e-深渊帝陵禁卫-暗黑全身长戟.jpg", "全身，长戟清晰，推荐"),
    ("05 原版", NEW / "05-法师-雷矛术.jpg", "带人物与画框，弃用"),
    ("05b 孤立雷矛", FIX / "05b-法师-雷矛术-孤立雷矛.jpg", "单体雷矛，推荐"),
    ("06 焰痕地带", NEW / "06-法师-焰痕地带.jpg", "对比用：贴地火环"),
    ("07 原版", NEW / "07-法师-烈焰震环.jpg", "火柱，动势强但不像环"),
    ("07b 爆环", FIX / "07b-法师-烈焰震环-爆环.jpg", "火环，但与06偏像"),
    ("07c 半球爆焰", FIX / "07c-法师-烈焰震环-半球爆焰.jpg", "爆发球，和06区分最好"),
    ("08 原版", OLD / "08-玄烬帝尊-深层回响.jpg", "全身，面甲遮脸"),
    ("08d 人脸", FIX / "08d-玄烬帝尊-人脸全身.jpg", "人脸正确，只有半身"),
    ("08e 远景全身", FIX / "08e-玄烬帝尊-远景全身.jpg", "全身，但脸被遮"),
]


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def main():
    cols, rows = 4, 3
    cell_w, cell_h = 450, 570
    canvas = Image.new("RGB", (cols * cell_w, rows * cell_h + 96), (12, 12, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 22), "第三批补拍与重生成 · 04 / 05 / 07 / 08 候选对照", font=font(34, True), fill=(238, 226, 205))
    draw.text((32, 68), "所有图均为 CogView 免费模型 JPEG，右下角 AI生成 水印未去除；方框内为对比用原图。", font=font(19), fill=(168, 156, 176))
    for i, (label, path, note) in enumerate(PANELS):
        col, row = i % cols, i // cols
        x, y = col * cell_w, 96 + row * cell_h
        draw.text((x + 18, y + 10), label, font=font(25, True), fill=(238, 226, 205))
        draw.text((x + 18, y + 44), note, font=font(17), fill=(170, 158, 180))
        img = Image.open(path).convert("RGB")
        thumb = ImageOps.contain(img, (cell_w - 36, cell_h - 138), Image.LANCZOS)
        canvas.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 74))
    out = NEW / "补拍与重生成-候选对照.jpg"
    canvas.save(out, quality=92, subsampling=0)
    print(out)


if __name__ == "__main__":
    main()
