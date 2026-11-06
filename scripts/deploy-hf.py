#!/usr/bin/env python3
# 《一刀999》Hugging Face Space 静态部署脚本（0.8.25 起固化，替代手工 upload_folder）。
#
# 背景：手工 upload_folder 曾两次把无 YAML 头的 game/README.md 覆盖到 Space 根，
# 导致 sdk: static 元数据丢失 → CONFIG_ERROR → 全站 404。本脚本固化以下流程：
#   1. 上传 game/ 全部内容（排除 .DS_Store 等 macOS 元数据）
#   2. 无条件重传带 sdk: static 元数据的 README.md（根治被覆盖问题）
#   3. 清理 Space 上已不在本地的文件（含目录条目过滤，避免误删）
#   4. 输出线上可达性自查结果
#
# 用法：
#   pip install huggingface_hub   # 需 huggingface_hub >= 0.23（list_repo_tree 递归）
#   export HF_TOKEN=hf_xxx        # 用户的 HF 访问令牌（write 权限）
#   python3 scripts/deploy-hf.py
#
# 设计约定：令牌只从环境变量读取，脚本与仓库内均不落盘（见 docs/20261028-1906 进度文档的安全规则）。

import os
import sys
import time
import urllib.request

from huggingface_hub import HfApi

REPO_ID = "xbzsb/oneknife999"
REPO_TYPE = "space"
GAME_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game")
# HF 的 YAML front matter：Space 配置的唯一事实源，丢了就 CONFIG_ERROR
SPACE_README = """---
title: 一刀999 · 百图征途
emoji: ⚔️
colorFrom: gray
colorTo: red
sdk: static
pinned: false
license: mit
---

# 一刀999 · 百图征途（浏览器原型）

传奇类 MMORPG 玩法验证原型：十章 100 关、三职业、106 种带独立行为 AI 的怪物、
装备强化/重铸/词缀/套装、难度阶梯与无尽深层。随仓库版本同步部署。

- 直接在浏览器中游玩，进度保存在本机 localStorage（本地存储）。
- 源码：https://gitcode.com/laotongtian/oneknife999
"""


def main() -> int:
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("错误：未设置 HF_TOKEN 环境变量")
        return 1
    if not os.path.isdir(GAME_DIR):
        print(f"错误：找不到游戏目录 {GAME_DIR}")
        return 1
    api = HfApi(token=token)

    # 1. 上传游戏内容（排除 macOS 元数据；upload_folder 增量，只传有变化的文件）
    print("== 1/4 上传 game/ 内容（增量）==")
    api.upload_folder(
        folder_path=GAME_DIR,
        repo_id=REPO_ID,
        repo_type=REPO_TYPE,
        ignore_patterns=[".DS_Store", "**/.DS_Store"],
        commit_message="部署：同步 game/ 目录（脚本化部署）",
    )

    # 2. 无条件重传 Space 根 README（防 upload_folder 覆盖丢 sdk 元数据——两次踩坑的根治点）
    print("== 2/4 重传带 sdk 元数据的 README ==")
    api.upload_file(
        path_or_fileobj=SPACE_README.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=REPO_ID,
        repo_type=REPO_TYPE,
        commit_message="部署：确保 Space 根 README 的 sdk static 元数据",
    )

    # 3. 清理 Space 上已不在本地的文件（list_repo_tree 递归会混入目录条目，必须过滤）
    print("== 3/4 清理本地已不存在的文件 ==")
    local = set()
    for root, _dirs, files in os.walk(GAME_DIR):
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), GAME_DIR).replace(os.sep, "/")
            local.add(rel)
    remote = [
        item.path
        for item in api.list_repo_tree(REPO_ID, repo_type=REPO_TYPE, recursive=True)
        if getattr(item, "blob_id", None) is not None  # 只保留文件，跳过目录条目
    ]
    # Space 保留文件：脚本维护的 README 与 git-lfs 指针配置
    keep = {"README.md", ".gitattributes"}
    stale = [p for p in remote if p not in local and p not in keep]
    if stale:
        api.delete_files(repo_id=REPO_ID, repo_type=REPO_TYPE, delete_patterns=stale,
                         commit_message=f"部署：清理 {len(stale)} 个已从本地移除的文件")
        print(f"已清理 {len(stale)} 个: {stale[:5]}{'...' if len(stale) > 5 else ''}")
    else:
        print("无多余文件")

    # 4. 自查：等 Space 状态回到 RUNNING 后探测首页
    print("== 4/4 自查 ==")
    for _ in range(12):
        info = api.space_info(REPO_ID)
        stage = info.runtime.stage if info.runtime else "UNKNOWN"
        if stage == "RUNNING":
            break
        time.sleep(5)
    print(f"Space 状态: {stage} | sdk: {info.sdk}")
    url = "https://xbzsb-oneknife999.static.hf.space/index.html"
    try:
        resp = urllib.request.urlopen(url, timeout=30)
        print(f"线上首页: {resp.status}（{url}）")
        ok = resp.status == 200 and info.sdk == "static"
    except Exception as error:
        print(f"线上首页探测失败: {error}")
        ok = False
    print("部署完成" if ok else "部署完成但自查未通过，请人工检查")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
