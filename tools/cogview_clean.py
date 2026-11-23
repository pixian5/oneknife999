#!/usr/bin/env python3
# CogView 生图结果水印清理工具。
# 背景：CogView-3-Flash 免费接口会在右下角合成“AI生成”水印；即使请求 watermark_enabled=false，
# 免费账号仍会保留显式水印。本工具先自动检测水印文字区域，再用 OpenCV Telea 修补，
# 不整边裁切，避免裁掉画面主体，同时尽量缩小修补面积。
import argparse
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as error:  # pragma: no cover - 环境缺依赖时给出明确指引
    raise SystemExit(
        "缺少 OpenCV 或 numpy，无法去水印。请先安装：python3 -m pip install opencv-python numpy"
    ) from error


def detect_watermark_bbox(image: np.ndarray) -> tuple[int, int, int, int] | None:
    """在右下角检测“AI生成”文字组，返回外接矩形。

    只搜索画面右下 50% x 28% 区域；水印文字为低饱和高亮像素，
    与金色裂缝、紫色烟雾等高饱和画面元素能区分开。
    """
    height, width = image.shape[:2]
    x_lo, y_lo = int(width * 0.50), int(height * 0.72)
    roi = image[y_lo:height, x_lo:width]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    # 水印文字：低饱和、高亮度；阈值放宽以兼容半透明灰字。
    mask = ((hsv[:, :, 1] < 60) & (hsv[:, :, 2] > 145)).astype(np.uint8) * 255
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 5)), iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 9)))
    count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, 8)

    boxes: list[tuple[int, int, int, int, int]] = []
    for index in range(1, count):
        x, y, box_w, box_h, area = stats[index]
        # 单个字或相邻几个字：宽高在水印字符范围内，且靠近右下角。
        if 25 <= box_w <= 340 and 12 <= box_h <= 100 and area >= 60:
            if (x + box_w) >= roi.shape[1] * 0.40 and (y + box_h) >= roi.shape[0] * 0.45:
                boxes.append((int(x), int(y), int(box_w), int(box_h), int(area)))
    if not boxes:
        return None

    # 把同一行、水平相邻的字符框合并成整组，避免只框到“成”一个字。
    boxes.sort(key=lambda item: item[0])
    grouped: list[list[int]] = []
    for x, y, box_w, box_h, _area in boxes:
        merged = False
        for group in grouped:
            gx, gy, gw, gh = group
            vertical_overlap = min(gy + gh, y + box_h) - max(gy, y)
            if vertical_overlap > min(gh, box_h) * 0.5 and x - (gx + gw) <= 38:
                group[0] = min(gx, x)
                group[1] = min(gy, y)
                group[2] = max(gx + gw, x + box_w) - group[0]
                group[3] = max(gy + gh, y + box_h) - group[1]
                merged = True
                break
        if not merged:
            grouped.append([x, y, box_w, box_h])

    best = max(grouped, key=lambda g: (g[0] + g[2]) * 2 + g[3])
    x, y, box_w, box_h = best
    x += x_lo
    y += y_lo

    # 水印文字外接框四周只留小安全边：左侧 18px、右侧 24px、上方 10px、下方 14px。
    # 这样能覆盖整块胶囊与阴影，又不会把大片干净背景一起涂掉。
    pad_left, pad_right, pad_top, pad_bottom = 18, 24, 10, 14
    return (
        max(0, x - pad_left),
        max(0, y - pad_top),
        min(width, x + box_w + pad_right),
        min(height, y + box_h + pad_bottom),
    )


def fallback_bbox(width: int, height: int) -> tuple[int, int, int, int]:
    """检测失败时按短边比例兜底，覆盖免费账号的整块胶囊水印。"""
    band_width = min(240, max(150, int(min(width, height) * 0.22)))
    band_height = min(100, max(60, int(height * 0.09)))
    return width - band_width, height - band_height, width, height


def expand_bbox(
    bbox: tuple[int, int, int, int], width: int, height: int
) -> tuple[int, int, int, int]:
    """把检测框外扩几像素，覆盖水印胶囊的阴影和抗锯齿边缘。"""
    x0, y0, x1, y1 = bbox
    return max(0, x0 - 2), max(0, y0 - 4), min(width, x1 + 2), min(height, y1 + 2)


def ring_stats(image: np.ndarray, bbox: tuple[int, int, int, int], offset: int = 22) -> tuple[float, float]:
    """取检测框外 22px 的一圈背景，返回灰度均值和标准差。

    标准差很低说明水印落在平滑背景上，可以用边缘插值无缝填充；
    标准差高说明背景有纹理/角色，直接插值会出现色块，应改用 OpenCV 修补。
    """
    height, width = image.shape[:2]
    x0, y0, x1, y1 = bbox
    lx, rx = max(0, x0 - offset), min(width - 1, x1 + offset)
    ty, by = max(0, y0 - offset), min(height - 1, y1 + offset)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    samples = [
        gray[y0:y1, lx] if x0 > 0 else None,
        gray[y0:y1, rx] if x1 < width else None,
        gray[ty, x0:x1] if y0 > 0 else None,
        gray[by, x0:x1] if y1 < height else None,
    ]
    pixels = [item.ravel() for item in samples if item is not None and item.size > 0]
    values = np.concatenate(pixels)
    return float(values.mean()), float(values.std())


def edge_fill(image: np.ndarray, bbox: tuple[int, int, int, int], offset: int = 22) -> np.ndarray:
    """用矩形四边外侧的背景做距离加权插值，适合纯色/渐变背景。

    对黑底图标，这比 inpaint 更干净：不会出现灰色雾块或深色矩形边框。
    """
    x0, y0, x1, y1 = bbox
    height, width = image.shape[:2]
    box_h, box_w = y1 - y0, x1 - x0
    lx, rx = max(0, x0 - offset), min(width - 1, x1 + offset)
    ty, by = max(0, y0 - offset), min(height - 1, y1 + offset)
    left = image[y0:y1, lx] if x0 > 0 else None
    right = image[y0:y1, rx] if x1 < width else None
    top = image[ty, x0:x1] if y0 > 0 else None
    bottom = image[by, x0:x1] if y1 < height else None

    yy, xx = np.mgrid[0:box_h, 0:box_w]
    numerator = np.zeros((box_h, box_w, 3), np.float32)
    denominator = np.zeros((box_h, box_w, 1), np.float32)
    for edge, distance, axis in (
        (left, xx + offset, 0),
        (right, box_w - xx + offset, 0),
        (top, yy + offset, 1),
        (bottom, box_h - yy + offset, 1),
    ):
        if edge is None:
            continue
        value = edge[:, None, :] if axis == 0 else edge[None, :, :]
        weight = 1.0 / (distance.astype(np.float32) + 1.0)[..., None]
        numerator += value * weight
        denominator += weight
    fill = np.clip(numerator / denominator, 0, 255).astype(np.uint8)
    return fill


def clean_image(
    path: Path,
    out_path: Path | None = None,
    quality: int = 95,
    fallback: bool = False,
) -> dict:
    """清理单张图片；默认原地覆盖，返回可写入清单的诊断信息。

    fallback=False 时，检测不到水印就直接返回，不做区域猜测；用于断点续跑时
    避免把本来就没有水印的旧图误伤。
    """
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"无法读取图片：{path}")
    height, width = image.shape[:2]
    bbox = detect_watermark_bbox(image)
    detected = bbox is not None
    if bbox is None and not fallback:
        return {
            "file": str(path),
            "width": width,
            "height": height,
            "region": None,
            "detected": False,
            "method": "no-watermark",
            "ring_mean": None,
            "ring_std": None,
            "band_std_before": None,
            "band_std_after": None,
        }
    if bbox is None:
        bbox = fallback_bbox(width, height)
    bbox = expand_bbox(bbox, width, height)
    x0, y0, x1, y1 = bbox

    before = cv2.cvtColor(image[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    mean, std = ring_stats(image, bbox)
    cleaned = image.copy()
    if std < 12:
        # 平滑背景：直接按四周背景插值，避免 inpaint 留下灰雾。
        cleaned[y0:y1, x0:x1] = edge_fill(image, bbox)
        method = "edge-interpolation"
    else:
        # 有纹理或角色覆盖：用 OpenCV Telea 修补，尽量保留附近结构。
        mask = np.zeros((height, width), np.uint8)
        mask[y0:y1, x0:x1] = 255
        cleaned = cv2.inpaint(image, mask, 4, cv2.INPAINT_TELEA)
        method = "opencv-inpaint-telea"
    after = cv2.cvtColor(cleaned[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)

    target = out_path or path
    target.parent.mkdir(parents=True, exist_ok=True)
    suffix = target.suffix.lower()
    if suffix == ".png":
        ok = cv2.imwrite(str(target), cleaned)
    else:
        ok = cv2.imwrite(str(target), cleaned, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"写入失败：{target}")

    return {
        "file": str(target),
        "width": width,
        "height": height,
        "region": [x0, y0, x1, y1],
        "detected": detected,
        "method": method,
        "ring_mean": round(mean, 2),
        "ring_std": round(std, 2),
        "band_std_before": round(float(before.std()), 2),
        "band_std_after": round(float(after.std()), 2),
    }


def iter_images(paths: list[str]) -> list[Path]:
    """收集待处理图片；目录会递归查找常见图片格式。"""
    found: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            for suffix in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
                found.extend(sorted(path.rglob(suffix)))
        elif path.is_file():
            found.append(path)
        else:
            print(f"跳过不存在的路径：{path}", file=sys.stderr)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="清理 CogView 右下角 AI生成 水印")
    parser.add_argument("paths", nargs="+", help="图片文件或目录（目录会递归处理）")
    parser.add_argument("--out-dir", help="输出目录；不填则原地覆盖")
    parser.add_argument("--quality", type=int, default=95, help="JPEG 输出质量，默认 95")
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="检测失败时强制清理右下角固定区域（默认关闭，避免误伤无水印图）",
    )
    parser.add_argument("--dry-run", action="store_true", help="只打印将处理的文件，不写入")
    args = parser.parse_args()

    images = iter_images(args.paths)
    if not images:
        print("没有找到可处理的图片", file=sys.stderr)
        return 1
    print(f"待处理 {len(images)} 张图片")
    for index, path in enumerate(images, 1):
        out_path = None
        if args.out_dir and not args.dry_run:
            out_path = Path(args.out_dir) / path.name
        print(f"[{index}/{len(images)}] {path}")
        if args.dry_run:
            continue
        info = clean_image(path, out_path, args.quality, fallback=args.fallback)
        if not info["detected"]:
            print("  未检测到 AI生成 水印，未改动；如确认有残留可用 --fallback 强制清理")
            continue
        print(
            f"  完成 → {info['file']}；区域 {info['region']}；检测={info['detected']}；"
            f"方式={info['method']}；灰度标准差 {info['band_std_before']} → {info['band_std_after']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
