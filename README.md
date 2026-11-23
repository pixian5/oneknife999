# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.71（见 [VERSION](VERSION)）

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
0.8.71：`run_abyss.py` 增加 `main-first` 开箱策略（有主线箱走主线，无主线才开支路），普通怪循环从 45 次提高到 120 次，目标池排除 NPC/友军，逐层 JSONL 增加 `completed`，能区分“boss 已死但小怪不够”的失败层。`npm run verify` 250/250，Prettier PASS。

本轮真实键鼠清层 **F86–F90**：回响单管 46214 / 51600 / 57090 / 62683 / 155434 HP，用时 191.7 / 250.2 / 201.8 / 219.6 / 858.5 秒，死亡 339→473。F86–F89 四层 863.3 秒、+55；F90 三次尝试合计 858.5 秒、+79，第一次 482.4 秒只清 1/5 小怪。五层合计 1721.8 秒、+134；同章节 HP 较 F76–F80 上行 11.5%–12.0%。

两个关键结论：**entry 开箱本身不再制造路线死亡**——F86 主线箱、F90 支路箱都是进层先开，开箱后第一次小怪日志死亡数不变；但 F87–F89 因 `main` 策略在没有主线箱时直接放弃 +2 药水，三层全程 0 药水。F90 真正的墙不是回响，而是 18150 HP 的 `深渊帝陵不灭战魂` 和 40540 HP 的 `玉髓守卫`：0 药水、1583 HP 下反复“复活→磨血→普通怪重置”，第 1 次 482.4 秒只清 1 只。F90 完成态 HP527、死亡473、金币464514、印记3529、等级41、击杀1728，截图 https://aka.doubaocdn.com/s/N1RgVIUici 。详见 [docs/20261123-1435-当前开发进度-豆包.md](docs/20261123-1435-当前开发进度-豆包.md)。

## 【下一步待实现】
用 `--cache-policy main-first --cache-timing entry` 跑 **F91–F95**，每层单独记录“第一只小怪耗时/死亡”，不要等整层结束才发现卡在 1/5。若仍卡死，把清怪策略切成道士远程风筝（现有 `ranged_cycle`），并加“单只小怪超时”诊断。F90 还暴露“回响被 AOE 提前击破→重生→最终 5/5 小怪即通关”的顺序问题：A 保留“击败过一次即可”但 UI 标“重生中”，B 回响重生时把 `bossDefeated` 置回 false；未拍板前不改通关判定，避免把 F90 已完成进度打回。完成态自动保存与 HUD 仍需游戏本体修；章节循环与“每层 +14% 生命”文案仍未拍板。详见 [docs/20261123-1435-下一步待实现-豆包.md](docs/20261123-1435-下一步待实现-豆包.md)。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**素材文件物理瘦身**（需拍板）、**41 级封顶后的经验反馈**。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
