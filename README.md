# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.68（见 [VERSION](VERSION)）

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
0.8.68：`tools/run_abyss.py` 增加单实例锁，防止多个 bot 同时操作同一页面互抢键鼠；实测第二个进程被拒绝启动。首领阶段“先清增援再打 boss”经 A/B 证明更差（F71 185.9s/+9 对 122.1s/+5，F72 192.9s/+11 对 179.1s/+9），已回退为只锁 boss。`npm run verify` 250/250，Prettier PASS。

本轮真实键鼠清层 **F71–F75**：回响单管 18456 / 22814 / 27265 / 31819 / 36478 HP，用时 122.1 / 179.1 / 120.7 / 105.1 / 223.6 秒，死亡 196→234；五层总用时 750.6 秒，平均 150.1 秒，死亡 +38（7.6/层）。F71–F75 与 F61–F65 同为第 1–5 章，HP 只上行 13.9%–14.7%，但总用时 +60.2%、死亡 +111%；F73/F74 仍接近上一轮，尖峰集中在 F71/F72/F75。

五层完成态的 `resourceClaimed` 全是 false：`run_abyss.py` 从不按 F 打开秘藏补给箱，0.8.65 的 +2 药水没有生效，F75 结束只剩 1 瓶掉落。因此 F71–F75 是“**无补给箱口径**”，死亡与用时被放大，不能直接据此调低深层难度。游戏本体：F1–F75 全部真实键鼠清层，`abyssBest=75`，F75 完成态 HP1583、死亡234、药水1、金币420296、印记2977。详见 [docs/20261123-0059-当前开发进度-豆包.md](docs/20261123-0059-当前开发进度-豆包.md)。

## 【下一步待实现】
先给 `tools/run_abyss.py` 增加“进层开秘藏补给箱”：从 `__ONEKNIFE_E2E__.catalog()` 取 `kind === "resource"` 的 `tacticalPoints`，真实移动 + 按 F，断言 `resourceClaimed=true` 且药水 +2；同时把每层 `diagnostics.deaths` 写入 `saves/abyss-floor-deaths.jsonl` 再按 T 深入。然后用修好的工具跑 **F76–F80**，对比开箱后死亡是否从 7.6/层降到 4/层附近，并复核 F80 里程碑倍率是否仍约 2.49。章节循环与“+14% 生命”文案的冲突仍需在 A/B 两案中拍板；第四批图标接入与 03/05/09/15 弱项补拍仍未定。详见 [docs/20261123-0059-下一步待实现-豆包.md](docs/20261123-0059-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
