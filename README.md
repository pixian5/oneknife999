# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.69（见 [VERSION](VERSION)）

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
0.8.69：`snapshot()` 新增只读 `tacticalPoints`；`run_abyss.py` 清完小怪后真实走到秘藏补给箱按 F，并断言 `resourceClaimed=true`；每层完成时把 `diagnostics.deaths` 写入 `saves/abyss-floor-deaths.jsonl`。`npm run verify` 250/250，Prettier PASS。

本轮真实键鼠清层 **F76–F80**：回响单管 41252 / 46119 / 51089 / 56163 / 139434 HP，用时 138.1 / 151.8 / 235.9 / 196.4 / 300.0 秒，死亡 234→299；五层 1022.2 秒，平均 204.4 秒，死亡 +65（13.0/层）。F80 里程碑 139434 / 56163 = **2.483 倍**，与 F40/F50/F60/F70 的约 2.49 一致。同章节较 F66–F70 上行约 13%，总用时 +10.7%、死亡 +27.5%；F76/F80 优于上一轮同章，F78 的 235.9s/+18 是支路补给箱路线导致。

五层 `resourceClaimed` 全为 true，但逐层死因显示 **15 次死亡发生在开箱路线，14 次来自支路**：F78 单层 7 次路线死亡，全在 boss 100%、距 boss 1275 以上，支路箱只换 2 瓶药水，收益/代价不成比例。F80 完成态 HP1023、死亡299、药水0、金币436664、印记3165、等级41、击杀1665。详见 [docs/20261123-0135-当前开发进度-豆包.md](docs/20261123-0135-当前开发进度-豆包.md)。

## 【下一步待实现】
用 `tacticalPoints.route`（0.8.69 已导出）做支路箱 A/B：A 只开主线箱、跳过支路；B 开支路箱前先清飞龙/影狼守怪，再按 F。用 **F81–F85** 验证死亡能否回到 4–6/层，F80 后回第 1 章，预计单管从 139434 回落到约 20k。章节循环与“+14% 生命”文案的冲突仍未拍板；第四批图标接入与 03/05/09/15 弱项补拍仍未定。详见 [docs/20261123-0135-下一步待实现-豆包.md](docs/20261123-0135-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
