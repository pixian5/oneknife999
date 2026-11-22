# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.64（见 [VERSION](VERSION)）

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
0.8.64：深层 **F31–F39 全部真实键鼠清层**，F39 回响「神魔战皇回响」30084 HP、109.0 秒击破，`abyssBest=39`。修复 **清层后残留中毒仍致死**：清层时只清怪与地面危险区，玩家毒层仍在非安全区结算；现在 `clearAbyssResiduals()` 会清毒层、毒计时、减速与眩晕节奏。F36–F39 连续四层清层后等待 5 秒以上，死亡数稳定在 21 / 23 / 27 / 31，未再毒死；`npm run verify` 246/246。F40 入口「玄烬帝尊回响」75431 HP，是 F39 的 2.5 倍，当前药水 0，暂未开打。

0.8.63 已完成 CogView 第四批 16 张装备/物品图标（桌面 46px、移动端 29px 验收），0.8.62 完成第三批 12 张技能图标与补拍；全部仍是 JPEG + 强制水印概念稿，未接入游戏。

游戏本体：三职业 100/100 全部真实通关；无尽深层 F1–F39 全部真实键鼠清层，死亡 31，F39 完成态药水 0、HP1583。详见 [docs/20261122-2117-当前开发进度-豆包.md](docs/20261122-2117-当前开发进度-豆包.md)。

## 【下一步待实现】
F40 的补给与难度断崖需要拍板：是“每层补给箱 +1 改 +2”“里程碑层加补给点”“下调 F40 回响血量”，还是保持现状硬闯。建议先做“每层补给箱 +2”的最小改动，再真实试玩 F40–F50，记录回响 HP、用时、死亡数与药水收支。装备与物品图标是否正式接入（需无水印授权、透明通道、46px/29px 重导出），以及 03 细链、05 无锁、09 像腰封、15 亮黄纸、第三批 04/08 缺口仍需拍板。详见 [docs/20261122-2117-下一步待实现-豆包.md](docs/20261122-2117-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
