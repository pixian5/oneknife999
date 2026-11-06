# 20261106-2330-HuggingFace静态部署-GLM.md

## 概述

把《一刀999》部署到 Hugging Face Space，获得一个可玩的线上地址：
**https://xbzsb-oneknife999.static.hf.space**

- Space 页面：https://huggingface.co/spaces/xbzsb/oneknife999
- 直接游玩：https://xbzsb-oneknife999.static.hf.space
- 类型：`sdk: static`（纯静态托管，免容器、免 GPU，免费额度永久可用）

## 部署方式

1. 验证令牌（`/api/whoami-v2`，用户 xbzsb、write 权限）。
2. API 创建 Space：`POST /api/repos/create`，`{"type":"space","name":"oneknife999","sdk":"static"}`。
3. 临时虚拟环境（`/tmp/hf-venv`，未污染系统 Python）安装 `huggingface_hub` 2.4.0。
4. `upload_folder(folder_path="game")` 把 `game/` 全部内容上传到 Space 仓库根
   （543 个素材 + index.html + src/，171MB，实际耗时约 1 分钟）。
5. 上传带 YAML front matter 的 README.md 声明 `sdk: static`。
6. 清理垃圾文件：`.DS_Store`、实验文件、HF 模板残留 `style.css`。

## 踩坑记录（三进三出，全部实测定位）

### 坑一：上传覆盖了 Space 配置 → CONFIG_ERROR

HF Space 依赖**仓库根 README.md 顶部的 YAML front matter** 声明 `sdk: static` 等配置。
首次 `upload_folder` 把游戏自带的 `game/README.md`（无 YAML 头）覆盖上去，Space 直接
`CONFIG_ERROR`（runtime 状态 API 可查），所有请求 503。

**修复**：上传带 front matter 的 README.md（`title/emoji/colorFrom/colorTo/sdk: static`）。
**教训**：向 Space 用 `upload_folder` 传整个目录时，务必先放一份带 YAML 头的 README，
或改用 `upload_file` 逐个上传避开根 README。

### 坑二：static Space 的直接域名多一段 `.static`

普通 Space（gradio/docker）直接域名是 `{owner}-{space}.hf.space`；
**static Space 是 `{owner}-{space}.static.hf.space`**。用普通域名测试一直 404，
官方文档没写这一点，最后从 Space 页面 HTML 里的 iframe `src` 找到真实地址。

**教训**：调试部署先抓平台页面里的实际资源地址，不要按记忆里的规则猜。

### 坑三（乌龙）：用不存在的文件测试 404

一度怀疑「中文文件名在 HF 上 404」，测试用的 `monster-full-腐烬矿工-idle.png`
**本身就不存在**——动作帧素材只有 0.5.1 的 50 种新野怪有，腐烬矿工只有静态立绘。
用 tree API 确认存在的文件（`boss-full-地宫龙君.png` 等）重测全部 200。
**教训**：报 404 先核对文件是否真的存在，再怀疑平台。最小对照实验（上传 `测试.png`
再取回，200）是推翻假设的关键一步。另外排除了 macOS NFD（分解式 Unicode）文件名
干扰——实测本机文件名均为 NFC，与 JS 源码一致。

## 验证数据

| 项 | 结果 |
|---|---|
| 首页 / game.css / src/main.js | 全部 200，MIME 正确（`application/javascript`，ES Module 可加载） |
| 中文文件名素材 | 200（`boss-full-地宫龙君.png` 62KB、`monster-full-冥河巨鳄-idle.png` 50KB 等） |
| 无头浏览器（本机 Chrome 通道） | 职业弹窗 3 项、选职业进入灰烬村外、引导横幅显示、Canvas 正常渲染 |
| 页面错误（pageerror） | 0 |
| 资源请求 | 85 个，其中 12 个 404 均为手工图怪的动作帧（素材不存在，走三级回退显示静态立绘，与本地行为一致） |
| 首次加载（networkidle） | 约 9.3 秒（含 171MB 中按需加载的部分） |

## 已知边界

- 直接访问域名仅 `*.static.hf.space`；`huggingface.co/spaces/xbzsb/oneknife999` 页面内嵌 iframe 同样可玩。
- 存档在浏览器 localStorage（本地存储）里，与本地版本互通需导入/导出功能（游戏已有）。
- Space 内容与仓库 `game/` 目录需手动同步：改代码后重跑上传命令即可（`upload_folder` 增量上传）。
- 部署脚本未入库（临时 venv 在 `/tmp`）；如需自动化可后续加 `scripts/deploy-hf.py` 与 GitHub Actions。

## 流量与耗时

上传 171MB 走本机 Wi-Fi（用户已确认），实际约 1 分钟；测试请求若干。

## 补记（同日晚：同步 0.8.25 与脚本化根治）

WorkBuddy 云电脑已把仓库推进到 **0.8.25**（素材瘦身 172→104MB、三职业难度归因、
反伤尊重入场无敌、首领印记出口、CI 流水线等约 20 个提交）。本地部署文档提交已变基合入。

**第二次踩同一坑**：增量同步 0.8.25 时 `upload_folder` 再次把无 YAML 头的 `game/README.md`
覆盖到 Space 根，sdk 元数据丢失 → CONFIG_ERROR → 全站 404（随后手工修复恢复 RUNNING）。
同坑两踩证明手工流程不可靠，已固化部署脚本：

- `scripts/deploy-hf.py`：上传（排除 .DS_Store）→ **无条件重传带 sdk 元数据的 README** →
  清理本地已删除文件（过滤 list_repo_tree 的目录条目，避免误删）→ 状态自查。
  令牌只从 `HF_TOKEN` 环境变量读取，不落仓库。
- 以后更新线上版本一条命令：`python3 scripts/deploy-hf.py`

另排除一次险情：`list_repo_tree` 递归模式混入 `assets`/`src` 目录条目，清理逻辑曾把它们
当作多余文件传给 delete——实测 HF 按精确文件名匹配未造成破坏，脚本已加类型过滤根治。

**当前线上状态（0.8.25）**：素材 103MB/551 个、首页与模块 200、无头浏览器进图验证
零 pageerror、Space RUNNING / sdk static。

## 补记 2（真实玩家模拟，0.8.26 线上版）

用 Playwright 真实时钟（无 e2e 接口、无快进）模拟玩家从零游玩线上版第一关，**81 秒通关**：

- 全链路：选战士 → 三步新手引导（10 秒完成移动步）→ 8 只普通怪 + 首领裂碑领主 → 通关自动保存
- 行为系统在线上生效实据：裂碑领主进入阶段 2 狂暴并释放地面危险区（蓄力警告日志）；不同怪伤害差异明显（裂脊尸卫首击仅 20-21 点——首击减伤被动生效，次击 31-38）
- 经济与成长：击杀 9、金币 561（含通关奖励 60）、首领印记 43、Lv.1→Lv.2（技能点 +1）
- 存档持久化：刷新页面后击杀/金币/关卡目标完整恢复，线上 localStorage 存档 `guideStep=99`
- 零 pageerror；截图确认章节氛围图、玩家/怪物贴图、蓄力环、铭牌、HUD 全套正常渲染
- 观察到的小瑕疵：金币 HUD 显示「金币  561」双空格——0.4.8 图标化的 `<img>` 无文本且 alt 为空所致，不影响功能，待后续清理
