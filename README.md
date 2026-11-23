# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.73（见 [VERSION](VERSION)）

## 快速开始

**在线游玩**：

- **Instabox 公网（当前主入口，随 `main` 更新）**：https://8080-agqxoy6u363jxgfufg2onqxbm4.instabox.tech
- Hugging Face Space（静态托管，更新节奏可能落后于 `main`）：https://xbzsb-oneknife999.static.hf.space

本地运行：

```bash
npm install
npm run serve      # 打开 http://127.0.0.1:4174
```

操作方式、关卡结构与验收命令见 [game/README.md](game/README.md)。

## 测试

```bash
npm run verify                # 语法检查 + 代码格式检查 + 纯函数单元测试（无需浏览器）
npm run test:ui               # 桌面 / 移动视口冒烟测试（含虚拟摇杆，需先 npm run serve）
npm run test:ui:regression    # 界面渲染与输入回归（需先 npm run serve）
npm run test:ui:nameplate     # 铭牌可读性回归：飘字 / 特效环不得压住血条（需先 npm run serve）
npm run test:e2e              # 真实浏览器百图通关回归（需先 npm run serve）
npm run perf                  # 帧率探测，结果写入 .test-artifacts/（需先 npm run serve）
npm run balance               # 真实速度数值模拟（三职业百图，输出 tests/balance-out.csv）
```

持续集成：0.7.0 按 GitCode 平行线的决定**删除 GitHub Actions**（主仓托管在 GitCode，Actions 无触发场景）。门禁改为本地 `npm run verify` + 三项浏览器回归，提交前必须跑完。

## 目录结构

```text
game/           可玩原型（index.html + src/ ES Modules + game.css）
tests/          浏览器回归（Playwright）与纯函数单元测试
docs/           设计文档事实源（00–20 分卷 + 历史备份 + 开发进度记录）
设计.md          设计总入口与阅读顺序
```

## 【当前开发进度】
0.8.73：美术生产规则切换完成。`tools/cogview_batch.py` 只读用户提供的 **GLM/CogView Key**（环境变量或仓库外的 `~/.config/oneknife999/zhipu.env`），不再依赖 `ZHIPU_API_KEY`，也不再使用内置 `image_gen`；新增 `tools/cogview_clean.py`，按背景类型自动检测并清除右下角“AI生成”水印（平滑背景用边缘插值，复杂背景用 OpenCV Telea 修补，不整边裁切）。已用第四批 01、第二批 08、1440×720 场景和一次真实 API 流水线验证，均无残留水印。

0.8.72 的第五批 12 张套装/品质徽记已验收，属于规则切换前的最后一批内置 `image_gen` 产物；玩法线仍停在 **F90 完成态**：最深 90、HP527、死亡 473、药水 0、金币 464514、印记 3529、等级 41、击杀 1728，按 T 可进 F91；F90 是三次尝试补完，合计 858.5 秒、+79，不能当成一次顺利通关。截图 https://aka.doubaocdn.com/s/N1RgVIUici 。详见 [docs/20261123-1613-当前开发进度-豆包.md](docs/20261123-1613-当前开发进度-豆包.md)。

## 【下一步待实现】
1. **美术不再使用内置 `image_gen`**：第五批之后的新批次一律走 `tools/cogview_batch.py`，交付前放大右下角确认无“AI生成”；复杂纹理场景若修补软化明显，优先考虑签署智谱“去水印管理”免责声明或调整构图。详见 [docs/20261123-1613-GLM美术生产与去水印-豆包.md](docs/20261123-1613-GLM美术生产与去水印-豆包.md)。
2. **先拍板第五批是否接入**：套装徽记适合放在装备详情/套装进度条（不小于 32px），品质徽章只适合 16px 色点或 24px 图例，不能拿去替 46/29px 的装备槽图标；接入前需确认槽位和透明化方案。详见 [docs/20261123-1613-下一步待实现-豆包.md](docs/20261123-1613-下一步待实现-豆包.md)。
3. 用 `--cache-policy main-first --cache-timing entry` 跑 **F91–F95**，每层单独记录“第一只小怪耗时/死亡”，卡在 1/5 就切道士远程风筝，并补“单只小怪超时”诊断。
4. F90 的“回响提前击破→重生→5/5 小怪即通关”仍需在 A（保留击败过一次、UI 标重生中）/ B（重生时把 `bossDefeated` 置回 false）之间拍板；未拍板前不改判定。
5. 第四批 16 张装备/物品图标仍未接入；03 细链、05 无锁、09 像腰封、15 亮黄纸的 29px 弱项仍在。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
