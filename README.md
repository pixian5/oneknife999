# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.79（见 [VERSION](VERSION)）

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
npm run verify                # 语法 / 版本 / 素材预算 / 格式 + 纯函数单元测试（无需浏览器）
npm run test:ui               # 桌面 / 移动视口冒烟测试（含虚拟摇杆，需先 npm run serve）
npm run test:ui:regression    # 界面渲染与输入回归（需先 npm run serve）
npm run test:ui:nameplate     # 铭牌可读性回归：飘字 / 特效环不得压住血条（需先 npm run serve）
npm run test:e2e              # 真实浏览器百图通关回归（需先 npm run serve）
npm run perf                  # 帧率探测，结果写入 .test-artifacts/（需先 npm run serve）
npm run balance               # 真实速度数值模拟（三职业百图，输出 tests/balance-out.csv）
```

持续集成：0.8.79 保持 GitHub Actions `main` / `work` 双分支触发，verify 含语法、版本、素材预算、格式与 **252 个单测**，UI 矩阵 19 项；本地提交前仍须跑 `npm run verify` + 关键浏览器回归。

## 目录结构

```text
game/           可玩原型（index.html + src/ ES Modules + game.css）
tests/          浏览器回归（Playwright）与纯函数单元测试
docs/           设计文档事实源（00–20 分卷 + 历史备份 + 开发进度记录）
设计.md          设计总入口与阅读顺序
```

## 【当前开发进度】
0.8.79：**地图阵容差异化 + 威胁标签**。`game/src/maps.js` 新增 `generatedMonsterRoster()`：每张生成图从本章 9 种怪里确定性取 4–6 种，相邻图重叠不超过较小阵容的一半；实测分布为 4 种 29 张、5 种 38 张、6 种 29 张，每章 5–6 种组合。`createEntities()` 用 `roster[spawn[2] % roster.length]` 映射实际怪种，`spawn[2]` 仍用于等级差；`generatedMap()` 增加 `monsterRoster` 与 `threat`，目标卡显示矿尘/灼热/腐雾/雷暴/潮汐标签。浏览器实测 stage_005 / 030 / 100 的阵容 6 / 5 / 5 种与去重怪名 6 / 5 / 5 种一致；`npm run verify` **252/252**，UI smoke、四视口状态 HUD、深层地形、boss adds、touch 全部通过。素材仍为 35.6MB / 940 个文件。详见 [docs/20261124-0058-地图阵容差异化-豆包.md](docs/20261124-0058-地图阵容差异化-豆包.md)。

0.8.78：**工程门禁 + 素材瘦身**。`check` 改为全量扫描 `tools/check-syntax.mjs`（100 个文件），新增 `tools/check-version.mjs`（VERSION / package / `CURRENT_APP_VERSION` / `CACHE_VERSION` / SW `SHELL` 一致）与 `tools/asset-budget.mjs`（素材 ≤60MB、地图 ≤450KB、单图 ≤500KB）。`game/assets` 从约 114MB / 811 个入库文件降到本批 **29.3MB / 756 个**：55 个旧 `monster-*.png`（约 41.3MB）移入 `art-source/monster-legacy/` 且不入库；`ui-divider.jpg` 2.07MB → 73KB，怪物/Boss/装备/技能按实际显示尺寸做调色板压缩。随后合并美术线第三批（46 只独立原画派生 184 张四帧，并修「自身白名单优先、别名回退」解析优先级），最终 **35.6MB / 940 个文件**，素材审计 106/106、137 个独立动作帧物种、0 别名复用、0 仅静态原画、0 无自有素材。`npm run verify` 250/250、桌面/移动/360/320 状态 HUD、6 例真实状态、touch / hud-health / death-save 全部通过。Instabox 已更新到 0.8.78，`main.js`/`sw.js`/新怪物帧均 200。详见 [docs/20261123-2228-工程门禁与素材瘦身-豆包.md](docs/20261123-2228-工程门禁与素材瘦身-豆包.md)。

0.8.77：**两条线合并 + Git 历史清理**。把 `main`（0.8.45，美术/实跑统计线）并入 `work`（0.8.76，玩法主线），用 `--no-ff` 保留汇合点；8 个冲突文件已解决，`game/src/main.js` 手工补回 `ULTIMATE_FX` 一刀时刻特效、`potionsUsed` 统计字段与 `deepTuned` 快照，避免 `tools/playthrough.cjs` 的 `potionUsed` 变成 `NaN`。`game/assets` 710 → **812**，并入 46 只无素材怪原画、12 种怪派生四帧、灰鬃狼/沙盗斥候补帧、`abyss-bg-01/02` 与 `fx-skill-ultimate`。同时从 Git 全历史删除 `.trae-html-share-packages/`、`tmp/`、`.screenshots/.tmp/` 三组误入垃圾（实测约 11.2 MiB），清理前生成 289MB 全量 bundle，强推 GitHub/GitCode 并删除 `deploy/0.8.6`、`trae/agent-SYLj24` 两个过期分支。合并后 `npm run format`、`npm run verify`（250/250）、四视口状态 HUD、6 例真实战斗状态回归全部通过；另外修掉 `loadMap` 未清 `lastKiller` 导致的状态假阳性。详见 [docs/20261123-2120-分支合并与Git历史清理-豆包.md](docs/20261123-2120-分支合并与Git历史清理-豆包.md)。

0.8.76：状态图标**真实战斗逐类验证**完成。新增 `tests/ui-status-real-combat.cjs`：不再直写 `state.player`，而是载入真实地图、把玩家放到真实怪的攻击距离内，让 `playerDamage → applyOnHitPassives` 写状态；中毒（腐毒僵尸）、减速（霜牙狼）、眩晕（矿脉蝙蝠）、致盲（雪原猎手）各真实命中一次，破甲走 `castSkill(0)` 的破甲斩命中该图首领。每次命中后暂停冻结 0.5 秒眩晕，核对 HUD 图标/角标并截图 5 张桌面 + 1 张 390px 移动端（中毒+减速双图标不被裁切）。新增命令 `npm run test:ui:status-real`。`main.js` 只在 `TEST_MODE` 下挂 `testApi`，让测试复用页面已载入的生产函数，绕开 macOS Chrome 二次 `import` 抖动。真实命中判据改用 `player.lastKiller`，避免安全区 10%/s 回血把生命差值抹平；新增 `tests/game-entry.cjs` 统一首屏入口，修掉状态图标 / smoke / layout 的职业卡点击 30 秒超时。详见 [docs/20261123-2041-真实战斗状态验证-豆包.md](docs/20261123-2041-真实战斗状态验证-豆包.md)。

详细进度：[docs/20261124-0058-当前开发进度-豆包.md](docs/20261124-0058-当前开发进度-豆包.md)。

0.8.75：第六批状态图标**接入 HUD**。`tools/build_status_icons.py` 用纯 PIL 圆形蒙版把 5 张黑底 JPEG 透明化、统一裁到 128px PNG，写入 `game/assets/status-*.png`；玩家血条下新增 32px 状态条，接**中毒（层数）、减速、眩晕、致盲**四类自身状态，**破甲**因挂在目标身上而单独放目标栏。新增 `stunTimer` 与状态计时初始化/换图清理；移动端侧栏由 96px 提到 140px，360/320 另加 127px 紧凑兜底，避免 `overflow-y:hidden` 裁掉状态条。浏览器回归 `test:ui:status` 覆盖 1440/390/360/320 四视口，并逐级检查 `overflow` 祖先裁切；本地产物 `试玩截图-状态图标HUD-桌面.png`、`...移动.png`、`...移动360.png`、`...移动320.png`。`game/assets` 706 → 711。详见 [docs/20261123-1854-状态图标HUD接入与透明化-豆包.md](docs/20261123-1854-状态图标HUD接入与透明化-豆包.md)。

0.8.74：第六批**状态效果图标 12 枚**完成。用用户提供的 GLM Key 调 `cogview-3-flash` 生成，1024×1024 JPEG，右下角“AI生成”全部自动清除；首轮 12 张返回后对眩晕、致盲、狂暴补拍，最终采用 `03c/04e/11b`。新增 `tools/art_status_preview.py`，输出 4×3 总览与 64/32/24/16px 的 1:1 对照；24–32px 是主力尺寸，16px 下 `03/04/11` 偏弱。素材目录 [美术素材-CogView/第六批-状态效果图标/](美术素材-CogView/第六批-状态效果图标/README.md)。详见 [docs/20261123-1640-状态效果图标第六批-豆包.md](docs/20261123-1640-状态效果图标第六批-豆包.md)。

0.8.73：美术生产规则切换完成。`tools/cogview_batch.py` 只读用户提供的 **GLM/CogView Key**（环境变量或仓库外的 `~/.config/oneknife999/zhipu.env`），不再依赖 `ZHIPU_API_KEY`，也不再使用内置 `image_gen`；新增 `tools/cogview_clean.py`，按背景类型自动检测并清除右下角“AI生成”水印（平滑背景用边缘插值，复杂背景用 OpenCV Telea 修补，不整边裁切）。已用第四批 01、第二批 08、1440×720 场景和一次真实 API 流水线验证，均无残留水印。

0.8.72 的第五批 12 张套装/品质徽记已验收，属于规则切换前的最后一批内置 `image_gen` 产物；玩法线仍停在 **F90 完成态**：最深 90、HP527、死亡 473、药水 0、金币 464514、印记 3529、等级 41、击杀 1728，按 T 可进 F91；F90 是三次尝试补完，合计 858.5 秒、+79，不能当成一次顺利通关。截图 https://aka.doubaocdn.com/s/N1RgVIUici 。详见 [docs/20261123-1613-当前开发进度-豆包.md](docs/20261123-1613-当前开发进度-豆包.md)。

## 【下一步待实现】
> 详细清单：[docs/20261124-0058-下一步待实现-豆包.md](docs/20261124-0058-下一步待实现-豆包.md)

0.8.79 已完成阵容差异化与威胁标签；下一步按以下顺序推进，先做可感知内容，再修深层终局，最后才是长线系统。

1. **0.8.80 地图差异化二期**：把矿尘/灼热/腐雾/雷暴/潮汐从标签接成可开关的实际机制；每章 2–3 张图放地图专属精英，先用第 1、4、7、10 章试点；目标卡、地图列表、进入日志三处同源，并补 UI 断言。
2. **0.8.81 深层修复**：F90 回响采用 **B 方案**（重生时 `bossDefeated=false`，必须清完 5 只小怪后再杀一次），已完成的 F90 做祖父保留、不倒退进度；深层每层入口一次性补给 1 瓶药水，死亡保留；用 A/B 验证“死亡保留普通怪已损生命 50%”是否能把 F91–F95 从数值墙拉回挑战层。修正“每层 +14% 生命”与实际约 +11.5% 的文案差异。
3. **终局长线**：图鉴按章 3/6/9 条目给三档奖励（+最大生命 / +金币 / +掉落率），106 全收集给称号；深层每 5 层三选一契约，先做 5 条；10/30/50/70/90 层给称号、光环、头像框，不给数值。
4. **美术与发布**：46 个怪已在 0.8.78 合并中派生四帧，下一步用真实逐帧动作原画覆盖同名文件，优先 12–20 个高频/章节代表怪，不重复生成派生帧；新美术只用用户提供的 GLM/CogView Key，禁用内置 `image_gen` 并检查右下角“AI生成”。发布前核对 Instabox 的 `CURRENT_APP_VERSION` 与 `sw.js` 缓存版本；0.8.79 会清旧代码缓存，首次打开会比之前慢一点。
5. **历史遗留**：真实长跑复验 `potionsUsed` 不再为 `NaN`；第四批 16 张装备/物品图标按 29px 可读性决定接入范围；Mac 仓库同步 0.8.79 时先 `git fetch --all --prune` 再 `git reset --hard origin/work`，不要直接 `git pull`。

## 【长期待办】
0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**41 级封顶后的经验反馈**。素材物理瘦身已在 0.8.78 完成；后续新增素材必须过 `asset-budget`。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
