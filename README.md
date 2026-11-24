# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.8.83（见 [VERSION](VERSION)）

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
npm run test:ui:threats       # 0.8.80 五类地图威胁 + 专属精英回归（需先 npm run serve）
npm run test:ui:echo          # 0.8.83 F90 回响 B / 入口补给一次性（需先 npm run serve）
npm run test:ui:preserve      # 0.8.84 A 组死亡重建 / 旧 abyssPreserve 开关失效（需先 npm run serve）
npm run test:e2e              # 真实浏览器百图通关回归（需先 npm run serve）
npm run perf                  # 帧率探测，结果写入 .test-artifacts/（需先 npm run serve）
npm run balance               # 真实速度数值模拟（三职业百图，输出 tests/balance-out.csv）
```

持续集成：0.8.84 保持 GitHub Actions `main` / `work` 双分支触发，verify 含语法、版本、素材预算、格式与 **266 个单测**，UI 矩阵 22 项；本地提交前仍须跑 `npm run verify` + 关键浏览器回归。

## 目录结构

```text
game/           可玩原型（index.html + src/ ES Modules + game.css）
tests/          浏览器回归（Playwright）与纯函数单元测试
docs/           设计文档事实源（00–20 分卷 + 历史备份 + 开发进度记录）
设计.md          设计总入口与阅读顺序
```

## 【当前开发进度】

0.8.84：**删除深层死亡保留 B 组实验**。A/B 各两轮 F91–F95 的总死亡同为 +47、+51，均值同为 +49；逐层方差远大于组间差异，B 没有可测收益。本版删除 `ABYSS_DEATH_RULES`、`preservedAbyssNormalHp()`、`restoreDamagedAbyssMonsters()` 与 `?abyssPreserve` 开关，并把 `test:ui:preserve` 改写为 A 组回归；深层普通怪死亡统一回到 A 组满血重建；首领受伤回填、F90 回响、入口补给均不变。单测 272→**266**，UI 矩阵仍 **22**（`ui:preserve` 改写为 A 组回归）；`npm run verify` **266/266**、素材 35.6MB / 940。版本 0.8.84、`CACHE_VERSION=oneknife999-v0.8.84`；提交 `f943daa`，GitHub Actions `work` `45433036267` / `main` `45433044747` 双 24/24 success，Instabox 已发布 0.8.84；详见 [0.8.84 移除 B](docs/20261125-0000-移除B组实验与0.8.84-豆包.md)、[当前开发进度](docs/20261125-0000-当前开发进度-豆包.md)、[下一步待实现](docs/20261125-0000-下一步待实现-豆包.md)。

0.8.83：**B 组普通怪回血修复**。0.8.82 的 B 组按“剩余已损伤害 50%”回填，同一只 21828 HP 普通怪在两次死亡后从 8302 回到约 17361，越死越回血。0.8.83 改成“死亡后最高压到 `maxHp*0.5`，且只降不升”：8302 保持 8302、17361 压到 10914、低于 50% 不回升；A 组 `ratio=0` 仍满血重建，默认不变。`test:ui:preserve` 实测默认 A=7145/7145、显式 A=7145/7145、显式 B=3573/7145，B 第二次死亡 1429/7145 不回血；A 两轮 F91–F95 为 +47、+51，B 两轮也是 +47、+51，均值同为 +49；B 没有测出优势，0.8.84 已删除 B；`npm run verify` **272/272**，`test:ui:echo` 通过。版本 0.8.83、`CACHE_VERSION=oneknife999-v0.8.83`；GitHub Actions `work` `45357852413` / `main` `45357859340` 双 run success，Instabox 已发布 0.8.83。详见 [B 组回血修复](docs/20261124-1629-B组回血修复与0.8.83-豆包.md)、[新 B 两轮复测](docs/20261124-1909-新B两轮F91-F95复测-豆包.md)、[当前开发进度](docs/20261124-1629-当前开发进度-豆包.md)、[下一步待实现](docs/20261124-1629-下一步待实现-豆包.md)。

0.8.82：**死亡保留默认回退 A**。F91–F95 全量真实长跑 A=+47 死、B=+52 死，B 未证明优于 A；尝试“清完额外普通怪”对照时，F91 的 A/B 都陷入死亡循环（A 4 分钟 +17、B 2 分钟 +4，均未清完 12 只），说明该路线不是当前可玩玩法，已停止。默认改回 A（普通怪满血重建），B 保留为显式实验（0.8.84 已删除，开关不再存在）：`?abyssPreserve=1` 或 localStorage=1。`test:ui:preserve` 默认 A=7145/7145、B=5716/7145；`npm run verify` **271/271**。GitHub Actions `80ddc10` 双 run success，Instabox 已发布 0.8.82。**F90 回响 B 真实复验为分段通过**：提前击破真实键鼠通过（`echoEarlyDefeated=true`、`bossDefeated=false`、marks 不变、12 只小怪不清）；最终击破在缩短回响 HP、清空普通怪的夹具下真实键鼠通过（`completed=true`、marks 3529→3564 恰好 +35）。完整端到端未通过：默认 A 死亡满血重建叠加 12 只约 21k HP 普通怪，提前击破后清 5 只时 deaths 481→497、kills 仍 1。B 组复验还发现普通怪会“越死越回血”：同一只 21828 HP 怪从 8302 回到约 17361，因为每次死亡把已损伤害再减半；B 若要保留，需改成固定 50% max HP 或只降不升。详见 [docs/20261124-1605-F90回响B真实复验结果-豆包.md](docs/20261124-1605-F90回响B真实复验结果-豆包.md)。

0.8.81：**深层终局修复**。F90 回响改为 B 方案：`buildAbyssMap(90)` 标记 `clear-first`，提前 AOE 击破只算“提前击破”，不置 `bossDefeated`、不清周边 5 只普通怪，回响 42 秒后重生；清完 5 只后再击破才通关，且一次 F90 只发 35 首领印记。旧档 F90 `completed` 做祖父保留，不会倒退 `abyssBest`。深层每层首次进入 +1 药水，用 `visitedMaps` 防死亡重进 / 刷新重复领。死亡保留普通怪已损生命 50% 做成 A/B，0.8.81 曾默认 B；0.8.82 已按全量数据回退默认 A（B 用 `?abyssPreserve=1` 显式开启；0.8.84 已删除）。深层成长文案从“每层 +14%”改为“同章每层 +14% 基础生命 / +7% 基础攻击，10 层换章”，单测锁定 F80→F90 实际约 +11.5%。新增 `test:ui:echo`、`test:ui:preserve`；`npm run verify` **271/271**，素材仍 35.6MB / 940。详见 [docs/20261124-0345-深层终局与回响B方案-豆包.md](docs/20261124-0345-深层终局与回响B方案-豆包.md)。

0.8.80：**地图威胁实际机制 + 每章专属精英**。新增 `game/src/threat.js`，把矿尘 / 灼热 / 腐雾 / 雷暴 / 潮汐从目标卡标签接成固定规则：矿尘野外玩家伤害 92%；灼热每 5 秒扣 2% 最大生命且只压到 1 HP；腐雾药水与法阵回复 72%；雷暴每 8 秒在脚下生成 1.2 秒预警圈、基础伤害 7% 最大生命；潮汐每 7 秒减速 1.6 秒到 65%。城镇 / 水井 / 篝火统一免疫环境伤害，但计时照常推进。每章第 5/7/9 张生成图放 30 个唯一称号的地图专属精英，固定落最高档刷怪点、每章 3 套固定双词缀；专属只占 3 只精英名额中的 1 只，普通图仍是最多 3 只。新增 `test:ui:threats`，实测专属实体、灼热扣血、雷暴落圈、潮汐减速、腐雾药水与安全区免疫；`npm run verify` **258/258**，素材仍 35.6MB / 940。详见 [docs/20261124-0145-地图威胁与专属精英-豆包.md](docs/20261124-0145-地图威胁与专属精英-豆包.md)。

0.8.79：**地图阵容差异化 + 威胁标签**。`game/src/maps.js` 新增 `generatedMonsterRoster()`：每张生成图从本章 9 种怪里确定性取 4–6 种，相邻图重叠不超过较小阵容的一半；实测分布为 4 种 29 张、5 种 38 张、6 种 29 张，每章 5–6 种组合。`createEntities()` 用 `roster[spawn[2] % roster.length]` 映射实际怪种，`spawn[2]` 仍用于等级差；`generatedMap()` 增加 `monsterRoster` 与 `threat`，目标卡显示矿尘/灼热/腐雾/雷暴/潮汐标签。浏览器实测 stage_005 / 030 / 100 的阵容 6 / 5 / 5 种与去重怪名 6 / 5 / 5 种一致；`npm run verify` **252/252**，UI smoke、四视口状态 HUD、深层地形、boss adds、touch 全部通过。素材仍为 35.6MB / 940 个文件。详见 [docs/20261124-0058-地图阵容差异化-豆包.md](docs/20261124-0058-地图阵容差异化-豆包.md)。

0.8.78：**工程门禁 + 素材瘦身**。`check` 改为全量扫描 `tools/check-syntax.mjs`（100 个文件），新增 `tools/check-version.mjs`（VERSION / package / `CURRENT_APP_VERSION` / `CACHE_VERSION` / SW `SHELL` 一致）与 `tools/asset-budget.mjs`（素材 ≤60MB、地图 ≤450KB、单图 ≤500KB）。`game/assets` 从约 114MB / 811 个入库文件降到本批 **29.3MB / 756 个**：55 个旧 `monster-*.png`（约 41.3MB）移入 `art-source/monster-legacy/` 且不入库；`ui-divider.jpg` 2.07MB → 73KB，怪物/Boss/装备/技能按实际显示尺寸做调色板压缩。随后合并美术线第三批（46 只独立原画派生 184 张四帧，并修「自身白名单优先、别名回退」解析优先级），最终 **35.6MB / 940 个文件**，素材审计 106/106、137 个独立动作帧物种、0 别名复用、0 仅静态原画、0 无自有素材。`npm run verify` 250/250、桌面/移动/360/320 状态 HUD、6 例真实状态、touch / hud-health / death-save 全部通过。Instabox 已更新到 0.8.78，`main.js`/`sw.js`/新怪物帧均 200。详见 [docs/20261123-2228-工程门禁与素材瘦身-豆包.md](docs/20261123-2228-工程门禁与素材瘦身-豆包.md)。

0.8.77：**两条线合并 + Git 历史清理**。把 `main`（0.8.45，美术/实跑统计线）并入 `work`（0.8.76，玩法主线），用 `--no-ff` 保留汇合点；8 个冲突文件已解决，`game/src/main.js` 手工补回 `ULTIMATE_FX` 一刀时刻特效、`potionsUsed` 统计字段与 `deepTuned` 快照，避免 `tools/playthrough.cjs` 的 `potionUsed` 变成 `NaN`。`game/assets` 710 → **812**，并入 46 只无素材怪原画、12 种怪派生四帧、灰鬃狼/沙盗斥候补帧、`abyss-bg-01/02` 与 `fx-skill-ultimate`。同时从 Git 全历史删除 `.trae-html-share-packages/`、`tmp/`、`.screenshots/.tmp/` 三组误入垃圾（实测约 11.2 MiB），清理前生成 289MB 全量 bundle，强推 GitHub/GitCode 并删除 `deploy/0.8.6`、`trae/agent-SYLj24` 两个过期分支。合并后 `npm run format`、`npm run verify`（250/250）、四视口状态 HUD、6 例真实战斗状态回归全部通过；另外修掉 `loadMap` 未清 `lastKiller` 导致的状态假阳性。详见 [docs/20261123-2120-分支合并与Git历史清理-豆包.md](docs/20261123-2120-分支合并与Git历史清理-豆包.md)。

0.8.76：状态图标**真实战斗逐类验证**完成。新增 `tests/ui-status-real-combat.cjs`：不再直写 `state.player`，而是载入真实地图、把玩家放到真实怪的攻击距离内，让 `playerDamage → applyOnHitPassives` 写状态；中毒（腐毒僵尸）、减速（霜牙狼）、眩晕（矿脉蝙蝠）、致盲（雪原猎手）各真实命中一次，破甲走 `castSkill(0)` 的破甲斩命中该图首领。每次命中后暂停冻结 0.5 秒眩晕，核对 HUD 图标/角标并截图 5 张桌面 + 1 张 390px 移动端（中毒+减速双图标不被裁切）。新增命令 `npm run test:ui:status-real`。`main.js` 只在 `TEST_MODE` 下挂 `testApi`，让测试复用页面已载入的生产函数，绕开 macOS Chrome 二次 `import` 抖动。真实命中判据改用 `player.lastKiller`，避免安全区 10%/s 回血把生命差值抹平；新增 `tests/game-entry.cjs` 统一首屏入口，修掉状态图标 / smoke / layout 的职业卡点击 30 秒超时。详见 [docs/20261123-2041-真实战斗状态验证-豆包.md](docs/20261123-2041-真实战斗状态验证-豆包.md)。

详细进度：[docs/20261124-1629-当前开发进度-豆包.md](docs/20261124-1629-当前开发进度-豆包.md)。

0.8.75：第六批状态图标**接入 HUD**。`tools/build_status_icons.py` 用纯 PIL 圆形蒙版把 5 张黑底 JPEG 透明化、统一裁到 128px PNG，写入 `game/assets/status-*.png`；玩家血条下新增 32px 状态条，接**中毒（层数）、减速、眩晕、致盲**四类自身状态，**破甲**因挂在目标身上而单独放目标栏。新增 `stunTimer` 与状态计时初始化/换图清理；移动端侧栏由 96px 提到 140px，360/320 另加 127px 紧凑兜底，避免 `overflow-y:hidden` 裁掉状态条。浏览器回归 `test:ui:status` 覆盖 1440/390/360/320 四视口，并逐级检查 `overflow` 祖先裁切；本地产物 `试玩截图-状态图标HUD-桌面.png`、`...移动.png`、`...移动360.png`、`...移动320.png`。`game/assets` 706 → 711。详见 [docs/20261123-1854-状态图标HUD接入与透明化-豆包.md](docs/20261123-1854-状态图标HUD接入与透明化-豆包.md)。

0.8.74：第六批**状态效果图标 12 枚**完成。用用户提供的 GLM Key 调 `cogview-3-flash` 生成，1024×1024 JPEG，右下角“AI生成”全部自动清除；首轮 12 张返回后对眩晕、致盲、狂暴补拍，最终采用 `03c/04e/11b`。新增 `tools/art_status_preview.py`，输出 4×3 总览与 64/32/24/16px 的 1:1 对照；24–32px 是主力尺寸，16px 下 `03/04/11` 偏弱。素材目录 [美术素材-CogView/第六批-状态效果图标/](美术素材-CogView/第六批-状态效果图标/README.md)。详见 [docs/20261123-1640-状态效果图标第六批-豆包.md](docs/20261123-1640-状态效果图标第六批-豆包.md)。

0.8.73：美术生产规则切换完成。`tools/cogview_batch.py` 只读用户提供的 **GLM/CogView Key**（环境变量或仓库外的 `~/.config/oneknife999/zhipu.env`），不再依赖 `ZHIPU_API_KEY`，也不再使用内置 `image_gen`；新增 `tools/cogview_clean.py`，按背景类型自动检测并清除右下角“AI生成”水印（平滑背景用边缘插值，复杂背景用 OpenCV Telea 修补，不整边裁切）。已用第四批 01、第二批 08、1440×720 场景和一次真实 API 流水线验证，均无残留水印。

0.8.72 的第五批 12 张套装/品质徽记已验收，属于规则切换前的最后一批内置 `image_gen` 产物；玩法线仍停在 **F90 完成态**：最深 90、HP527、死亡 473、药水 0、金币 464514、印记 3529、等级 41、击杀 1728，按 T 可进 F91；F90 是三次尝试补完，合计 858.5 秒、+79，不能当成一次顺利通关。截图 https://aka.doubaocdn.com/s/N1RgVIUici 。详见 [docs/20261123-1613-当前开发进度-豆包.md](docs/20261123-1613-当前开发进度-豆包.md)。

## 【下一步待实现】

> 详细清单：[docs/20261125-0000-下一步待实现-豆包.md](docs/20261125-0000-下一步待实现-豆包.md)

0.8.84 已删除 B 组实验，深层死亡统一 A 组；下一步按以下顺序推进：

1. **0.8.84 发布**：提交/推送 0.8.84，CI 全绿后核对 Instabox；默认页真实死亡一次确认普通怪满血重建，`?abyssPreserve=1` 不再改变行为。
2. **F90 回响完整端到端**：F90 未完成档预置 20 瓶以上药水，真实键鼠走“提前击破 → 清 5 只 → 42 秒重生 → 最终击破”；若仍被 12 只普通怪压死，再讨论调整 F90 普通怪密度或首领干扰，不要先改回响规则。
3. **终局长线**：图鉴按章 3/6/9 条目给三档奖励（+最大生命 / +金币 / +掉落率），106 全收集给称号；深层每 5 层三选一契约，先做 5 条；10/30/50/70/90 层给称号、光环、头像框，不给数值。
4. **0.8.80 机制观测**：真实长跑统计五类威胁的致死 / 受伤占比，重点看“雷暴 + 首领技能”的叠加致死率；统计 30 张专属精英图的击杀率与绕行率。
5. **美术与发布**：46 个怪已派生四帧，下一步用真实逐帧动作原画覆盖同名文件，优先 12–20 个高频/章节代表怪；新美术只用用户提供的 GLM/CogView Key，禁用内置 `image_gen` 并检查右下角“AI生成”。

## 【长期待办】

0.8.45 之后：**真人路径冒烟固化**、**暂停时养成操作边界**、**道士深层过强拆解**、**28–45s 重生后的刷怪密度复核**；0.8.42 遗留：**真实速度分段采样 40–100 关**、**章节开头难度尖峰复核**、**41 级封顶后的经验反馈**。素材物理瘦身已在 0.8.78 完成；0.8.80 的威胁机制仍需真实长跑观测，后续新增素材必须过 `asset-budget`。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [文档索引.md](文档索引.md)：`docs/` 全部文档的分类索引与适用场景
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [经验/](经验/)：从 docs 提炼的分类经验（工程与测试、战斗与数值、文档与流程），上手与避坑优先看这里
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式
