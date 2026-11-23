# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.70（见 [VERSION](VERSION)）

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
0.8.70：`run_abyss.py` 新增 `--cache-policy all|main|none` 与 `--cache-timing entry|after-clear|after-boss`；逐层 JSONL 增加 HP、药水、开箱路线与时机；每层完成先点游戏内“保存”再落盘，避免 HUD 与存档 HP 不一致。默认仍是 `all + after-clear`，本轮用 `main + after-clear` 跑主线箱。`npm run verify` 250/250，Prettier PASS。

本轮真实键鼠清层 **F81–F85**：回响单管 20818 / 25696 / 30667 / 35741 / 40919 HP，用时 124.6 / 106.0 / 192.9 / 146.2 / 128.2 秒，死亡 299→339。五层 697.9 秒，平均 139.6 秒，死亡 +40。较 F71–F75 快 7.0%、多死 5.3%，同章节 HP 上行 12.2%–12.8%。F81 的 20818 只有 F80 的 139434 的 14.9%，每 10 层回第 1 章，是一条明显的锯齿轮廓。

关键更正：**主线补给箱同样会付出路线死亡**。五层 40 死里 18 死发生在开箱路线（45%），F83 只开主线箱仍有 8 次路线死亡，全部 `bossHpPct=100`、距 boss 1391–1557。问题不是主线/支路，而是“清完 5 只小怪后回头跑图”正好撞上 28–45 秒重生窗口。F85 完成态 HP981、死亡339、药水0、金币450117、印记3350、等级41、击杀1698，截图 https://aka.doubaocdn.com/s/IwyzpUrMIV 。详见 [docs/20261123-1328-当前开发进度-豆包.md](docs/20261123-1328-当前开发进度-豆包.md)。

## 【下一步待实现】
用 `--cache-policy main --cache-timing entry` 跑 **F86–F90**：进层先开主线箱，再清小怪和回响，看路线死亡能否从 18 次降下来。F86–F90 是第 6–10 章，F90 是帝陵回响；若 `entry` 仍被守怪打死，再加 `none` 做无箱对照，不再在主线/支路之间猜。另修游戏本体“完成态自动保存”时点：现在日志 HP854、自动存档 HP600、HUD HP981 会并存，验收要求回血稳定后三处一致。章节循环与“每层 +14% 生命”文案仍未拍板。详见 [docs/20261123-1328-下一步待实现-豆包.md](docs/20261123-1328-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
