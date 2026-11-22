# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.62（见 [VERSION](VERSION)）

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
0.8.62：CogView-3-Flash 第三批完成 **三职业 12 个技能图标**，并补拍 04 禁卫、05 雷矛、07 火环、08 帝尊共 7 张候选。最终图标为 01–04、05b、06、07c、08–12；桌面 23px、移动端 19px 的 1:1 技能按钮预览已完成，缩到真实尺寸后仍能区分。04 用 `04e` 暗黑全身长戟，08 用 `08d` 保人脸、`08e` 保全全身。全部仍是 JPEG + 强制水印概念稿，未接入游戏。

0.8.61 已完成 CogView 第二批深层概念稿：12 张主图 + 4 张补拍，含三职业深层觉醒、深层怪、深层首领与 4 个图标，附总览、实际尺寸预览和候选对照。

游戏本体：三职业 100/100 全部真实通关；无尽深层 F1–F30 全部真实键鼠清层，F30 回响 59431 HP 击杀，`abyssBest=30`，F31 未试玩。详见 [docs/20261122-1915-当前开发进度-豆包.md](docs/20261122-1915-当前开发进度-豆包.md)。

## 【下一步待实现】
继续 F31 以后的真人推进，重点验证 F31–F40 的补给与伤害曲线；同时拍板技能图标是否正式接入（需无水印授权、透明通道、23px/19px 重导出）。04/08 的单图构图缺口、07 的“视觉区分 vs 技能语义”仍需拍板。详见 [docs/20261122-1915-下一步待实现-豆包.md](docs/20261122-1915-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
