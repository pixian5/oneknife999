#!/usr/bin/env python3
# CogView-3-Flash 批量概念稿生成器（仅用于测试，不写入游戏生产目录）。
# 设计要点：串行请求 + 429 退避 + 断点续跑；API Key 只从环境变量读取，绝不落盘。
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

API_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"
MODEL = "cogview-3-flash"


def log(message: str) -> None:
    """统一带时间戳的日志，方便排查限流与断点。"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)


def post_json(api_key: str, payload: dict, timeout: int = 180) -> dict:
    """调用生图接口；只返回 JSON，HTTP 错误交给上层处理。"""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def download(url: str, target: Path, timeout: int = 180) -> str:
    """下载生成结果，并按文件头纠正扩展名（接口常返回 _watermark.png 但实际是 JPEG）。"""
    request = urllib.request.Request(url, headers={"User-Agent": "oneknife999-cogview/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
    if not body:
        raise RuntimeError("下载结果为空")
    if body[:2] == b"\xff\xd8":
        suffix = ".jpg"
    elif body[:8] == b"\x89PNG\r\n\x1a\n":
        suffix = ".png"
    else:
        suffix = target.suffix or ".bin"
    final = target.with_suffix(suffix)
    final.write_bytes(body)
    # 若清单写了 .jpg 但实际为 .png，删除旧占位名，避免重复文件。
    if final != target and target.exists():
        target.unlink()
    return str(final)


def generate_one(api_key: str, item: dict, out_dir: Path, max_retries: int) -> dict:
    """生成单张图；遇到 429 做指数退避，其它错误最多重试 2 次。"""
    target = out_dir / item["filename"]
    if target.exists() and target.stat().st_size > 0:
        log(f"跳过已存在：{target.name}")
        return {
            "slug": item["slug"],
            "name": item["name"],
            "size": item["size"],
            "prompt": item["prompt"],
            "file": str(target),
            "skipped": True,
        }

    payload = {
        "model": MODEL,
        "prompt": item["prompt"],
        "size": item["size"],
    }
    for attempt in range(1, max_retries + 1):
        try:
            log(f"请求 {item['slug']}（{item['size']}，第 {attempt} 次）")
            result = post_json(api_key, payload)
            url = result["data"][0]["url"]
            saved = download(url, target)
            meta = {
                "slug": item["slug"],
                "name": item["name"],
                "size": item["size"],
                "prompt": item["prompt"],
                "file": saved,
                "request_id": result.get("request_id") or result.get("id"),
                "url_expires_hint": "临时下载地址，已本地保存；不要用远程 URL 做稳定引用",
                "watermark": "免费模型强制右下角 AI生成 水印，未去除",
                "created_at": datetime.now().isoformat(timespec="seconds"),
            }
            log(f"完成 {item['slug']} → {Path(saved).name}（{Path(saved).stat().st_size // 1024} KB）")
            return meta
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")[:300]
            if error.code == 429:
                wait = min(90, 30 * attempt)
                log(f"429 限流，等待 {wait} 秒后重试：{body}")
                time.sleep(wait)
                continue
            if error.code in (500, 502, 503, 504):
                wait = min(60, 10 * attempt)
                log(f"HTTP {error.code} 临时错误，等待 {wait} 秒：{body}")
                time.sleep(wait)
                continue
            raise RuntimeError(f"{item['slug']} HTTP {error.code}: {body}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            wait = min(60, 10 * attempt)
            log(f"网络错误，等待 {wait} 秒：{error}")
            time.sleep(wait)
    raise RuntimeError(f"{item['slug']} 超过最大重试次数")


def main() -> int:
    parser = argparse.ArgumentParser(description="CogView-3-Flash 批量概念稿生成")
    parser.add_argument("--manifest", required=True, help="清单 JSON 路径")
    parser.add_argument("--out-dir", required=True, help="输出目录")
    parser.add_argument("--interval", type=int, default=30, help="成功请求之间的间隔秒数")
    parser.add_argument("--retries", type=int, default=6, help="单张最大重试次数")
    args = parser.parse_args()

    api_key = os.environ.get("ZHIPU_API_KEY", "").strip()
    if not api_key:
        log("缺少环境变量 ZHIPU_API_KEY，拒绝运行")
        return 2

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    items = manifest["items"]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    log(f"共 {len(items)} 张；输出 {out_dir}；间隔 {args.interval}s；模型 {MODEL}")

    results = []
    for index, item in enumerate(items, 1):
        log(f"===== {index}/{len(items)} {item['name']} =====")
        results.append(generate_one(api_key, item, out_dir, args.retries))
        if index < len(items):
            time.sleep(args.interval)

    meta_path = out_dir / "生成清单.json"
    # 同一目录可多次追加不同清单；按 slug 合并，避免后一批覆盖前一批的元数据。
    existing = []
    if meta_path.exists():
        try:
            existing = json.loads(meta_path.read_text(encoding="utf-8")).get("items", [])
        except json.JSONDecodeError:
            log("旧生成清单无法解析，按空清单处理")
    merged = {entry.get("slug"): entry for entry in existing if entry.get("slug")}
    for entry in results:
        merged[entry["slug"]] = entry
    meta_path.write_text(
        json.dumps({"model": MODEL, "items": list(merged.values())}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log(f"全部完成，清单：{meta_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
