# 《一刀999》

原创传奇类 MMORPG 的可玩浏览器原型 + 完整设计文档体系。

- **可玩原型**：十章 100 张连续关卡、三职业、首领阶段战、掉落装备、自动保存；纯前端 Canvas 实现，代码位于 [game/](game/)。
- **设计文档**：[docs/](docs/) 是设计事实源（产品、战斗、成长、地图、PK、行会、经济、服务器、QA、数值基线），治理规则见 [docs/README.md](docs/README.md)。
- **当前版本**：0.2.4（见 [VERSION](VERSION)）

## 快速开始

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
npm run test:e2e              # 真实浏览器百图通关回归（需先 npm run serve）
npm run perf                  # 帧率探测，结果写入 .test-artifacts/（需先 npm run serve）
```

持续集成：[ci.yml](.github/workflows/ci.yml) 在每次 push 运行校验；[e2e.yml](.github/workflows/e2e.yml) 手动或每周运行百图回归。

## 目录结构

```text
game/           可玩原型（index.html + src/ ES Modules + game.css）
tests/          浏览器回归（Playwright）与纯函数单元测试
docs/           设计文档事实源（00–20 分卷 + 历史备份 + 开发进度记录）
设计.md          设计总入口与阅读顺序
```

## 【当前开发进度】

0.2.1 完成界面性能修复：首领刷新读秒改为读取实体（修复固定 0s）、HUD 面板按需渲染、按键大小写归一化，并新增 `tests/ui-render-input-regression.cjs` 常驻回归（详见 [docs/20-界面性能与倒计时修复记录.md](docs/20-界面性能与倒计时修复记录.md)）。

0.2.2 完成工程化补强：单文件原型拆分为 8 个 ES Modules（0.2.1 的修复一并并入模块）、测试本地化（系统 Chrome + npm 脚本）、13 个纯函数单元测试、GitHub Actions CI，以及 HUD 脏检查与静态地图离屏缓存两项渲染优化。行为契约（存档 v3、E2E 接口）保持不变，战士百图回归 100/100 通过。

0.2.3 完成 P1 工程收尾：战斗/掉落纯逻辑下沉为 `combat.js` / `drops.js`（新增 20 个单测）、存档改为迁移函数表驱动（新增 6 个单测）、Prettier 统一代码风格并并入 `verify`、虚拟摇杆替换四向按钮并新增 360px 视口用例、`npm run perf` 帧率探测（平均约 4647 fps、最差帧 8.3ms、零长帧，暂不做分层缓存），并修复 `pointOnPath` 单段路径 NaN 隐患。行为契约保持不变，战士百图回归 100/100 通过。

0.2.4 完成全面修复轮（依据深度代码分析报告）：关 4→5 数值断崖消除（生成曲线锚定手工图第 4 关，难度与装备两条断层同修）、玩家承伤公式对齐 docs/11 基线（新增 `computeIncomingDamage` 纯函数）、E2E 接口补 gold/marks/deaths/背包/装备字段并新增每关经济与死亡断言、损坏存档安全回退 + console.warn 诊断、HUD 计算层签名缓存（帧率提升至平均 6527 fps）、技能栏冷却不再每秒重建（修复键盘焦点丢失）、移动端 safe-area / touch-action / 761–900px 断点三件套、encounterBands 元数据改为实际统计生成、命名 stutter 与十章主 Boss 档案补齐。单测 39 → 49 个，战士百图回归 100/100 通过，e2e.yml 升级为三职业并发。

详细内容见 [docs/20261021-0316-当前开发进度-GLM.md](docs/20261021-0316-当前开发进度-GLM.md)。

## 【下一步待实现】

优先：移动端真机触控验证、真实速度数值复测（新曲线前期更痛属设计意图）、帧率基线复测纪律、`tryTravel` 原生 confirm 改弹层；随后是玩法内容（12 部位装备与强化、技能树、任务链）与多人服务器最小验证。

详细内容见 [docs/20261021-0316-下一步待实现-GLM.md](docs/20261021-0316-下一步待实现-GLM.md)。

## 相关入口

- [设计.md](设计.md)：设计总入口、阅读顺序与核心承诺
- [docs/README.md](docs/README.md)：全部设计分卷与文档治理规则
- [game/README.md](game/README.md)：原型操作、模块结构与验收方式