// 纯函数单元测试：无尽深层程序化地形（0.8.33，设计稿 docs/20261117-1010 回归 1-7）。
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAPS,
  MAP_ORDER,
  MAP_CLEAR_RULES,
  buildAbyssMap,
  ensureAbyssMap,
  abyssMapId,
  abyssFloorFromId,
  ABYSS_MAP_PREFIX,
  generatedMap
} from "../../game/src/maps.js";
import { abyssMultipliers } from "../../game/src/endgame.js";

test("回归1 种子确定性：同层两次构建 deep-equal（同层同布局）", () => {
  assert.deepStrictEqual(buildAbyssMap(57), buildAbyssMap(57));
  assert.deepStrictEqual(buildAbyssMap(1), buildAbyssMap(1));
});

test("回归2 布局差异：F1~F30 两两不重、且不与百图生成图撞 boss 坐标", () => {
  const floors = Array.from({ length: 30 }, (_, i) => buildAbyssMap(i + 1));
  const signature = (map) => `${map.layoutId}|${map.boss.x},${map.boss.y}|${map.paths[0].join(",")}`;
  const seen = new Set();
  for (const map of floors) {
    const sig = signature(map);
    assert.ok(!seen.has(sig), `层 ${map.abyssFloor} 与更早层布局重复`);
    seen.add(sig);
  }
  // 与百图生成图不撞（撞布局必撞 boss 坐标 + townY 站位）
  const mainlineBoss = new Set(
    Array.from({ length: 96 }, (_, i) => {
      const m = generatedMap(i + 5);
      return `${m.boss.x},${m.boss.y}`;
    })
  );
  for (const map of floors) assert.ok(!mainlineBoss.has(`${map.boss.x},${map.boss.y}`), `层 ${map.abyssFloor} 与百图撞 boss 坐标`);
});

test("回归3 静态表隔离：MAP_ORDER 不含深层、CLEAR_RULES 无后继且带 abyss 标记", () => {
  ensureAbyssMap(1);
  ensureAbyssMap(9);
  for (const id of MAP_ORDER) assert.ok(!id.startsWith(ABYSS_MAP_PREFIX), "MAP_ORDER 不得收录深层");
  const rule = MAP_CLEAR_RULES["abyss-F1"];
  assert.ok(rule, "注册后须有规则条目");
  assert.equal(rule.next, null);
  assert.equal(rule.abyss, true);
  assert.equal(rule.kills, 5);
});

test("回归4 深层地图 exits 恒为空（根治 isForwardExit 的 indexOf=-1 错位）", () => {
  for (const floor of [1, 2, 3, 4, 5]) assert.deepEqual(buildAbyssMap(floor).exits, []);
});

test("回归5 数值同源：深层怪基础数值 = 主题章基准关同名怪（成长由 abyssMultipliers 在实体层叠加）", () => {
  for (const floor of [1, 7, 23]) {
    const abyss = buildAbyssMap(floor);
    const chapterIndex = (floor - 1) % 10;
    const base = generatedMap(chapterIndex * 10 + 5);
    const baseByName = new Map(base.monsterTypes.map((t) => [t.name, t]));
    for (const type of abyss.monsterTypes) {
      if (type.deepTuned) {
        // 0.8.34 深渊化怪：基准关同档位 hp × 1.6（名字带「深渊」前缀，素材同名复用）。
        const baseName = type.name
          .replace(/^深渊/, "")
          .replace(new RegExp(`^${["边境", "苍月", "龙脉", "冰封", "烬火", "幽冥", "天穹", "星陨", "神魔", "帝陵"][chapterIndex]}`), "");
        const ref = baseByName.get(baseName.startsWith("边境") ? baseName : baseName);
        const idx = Math.max(0, [...baseByName.keys()].indexOf(ref?.name ?? ""));
        const tierHp = Math.round((480 + idx * 17.5) * (1 + (chapterIndex * 10 + 5 - 4) * 0.0097));
        assert.equal(type.hp, Math.round(tierHp * 1.6), `深渊怪 ${type.name} 应为基准档 ×1.6`);
        continue;
      }
      const ref = baseByName.get(type.name);
      assert.ok(ref, `深层章怪 ${type.name} 应来自主题章基准关`);
      assert.equal(type.hp, ref.hp, `${type.name} 基础 hp 与基准关一致`);
      assert.equal(type.attack, ref.attack);
    }
  }
  // 叠加链仍在：F1 成长倍率 > 1
  assert.ok(abyssMultipliers(1).hp > 1);
});

test("回归6 Boss 层系数：F10 ×1.25（三阶段）、守门层 ×0.55（0.8.38 调参，攻击另设补偿系数）", () => {
  const bossFloor = buildAbyssMap(10);
  const guardFloor = buildAbyssMap(3);
  const base = generatedMap(((10 - 1) % 10) * 10 + 5);
  assert.equal(bossFloor.boss.hp, Math.round(base.boss.hp * 1.25));
  assert.equal(bossFloor.boss.phases, 3);
  assert.equal(guardFloor.boss.hp, Math.round(generatedMap(((3 - 1) % 10) * 10 + 5).boss.hp * 0.55));
  assert.equal(guardFloor.boss.phases, 2);
});

test("回归7 幂等注册：同层同引用、MAPS 单份、id 与层数互转一致", () => {
  const first = ensureAbyssMap(5);
  assert.strictEqual(ensureAbyssMap(5), first, "重复注册必须返回同一引用");
  assert.strictEqual(MAPS["abyss-F5"], first);
  assert.equal(abyssMapId(5), "abyss-F5");
  assert.equal(abyssFloorFromId("abyss-F5"), 5);
  assert.equal(abyssFloorFromId("stage_005"), 0);
  assert.equal(abyssFloorFromId(""), 0);
});

test("附带：深层地图结构与命名（供 loadMap/渲染的必要字段齐全）", () => {
  const map = buildAbyssMap(12);
  assert.ok(map.name.startsWith("深层·"));
  assert.equal(map.abyssFloor, 12);
  assert.equal(map.stageNumber, 112);
  assert.ok(map.monsterSpawns.length >= 10, "刷怪点沿用布局产出");
  assert.ok(map.tacticalPoints.length >= 3, "篝火/秘藏/场景节点齐全");
  assert.ok(
    map.drops.some((d) => d.setKey),
    "掉落带套装键"
  );
  assert.ok(map.story.beatTitle.includes("F12"), "剧情标题含层数");
  // 怪物种类随层变化（5~7 种轮换）
  const counts = new Set([buildAbyssMap(1), buildAbyssMap(2), buildAbyssMap(3)].map((m) => m.monsterTypes.length));
  assert.ok(counts.size > 1, "相邻层数怪种数应有变化");
});

test("回归9 F90 终局密度与回响阈值：6 个营位、回响 ×0.90、F80 不变", () => {
  const f90 = buildAbyssMap(90);
  const base = generatedMap(95);
  assert.equal(f90.monsterSpawns.length, 6, "F90 只应保留 6 个刷怪营位");
  assert.equal(
    f90.routePlan.encounterBands.reduce((sum, band) => sum + band.count, 0),
    6,
    "F90 routePlan 的分段计数必须与 6 个营位一致"
  );
  assert.equal(f90.boss.hp, Math.round(base.boss.hp * 0.9), "F90 回响基础 HP 应为基准关 ×0.90");
  assert.equal(f90.boss.phases, 3, "F90 仍是三阶段回响");
  assert.deepEqual(f90.normalTuning, { hp: 0.55, attack: 0.6, defense: 0.8 }, "F90 普通怪必须按终局降档系数结算");
  assert.deepEqual(buildAbyssMap(80).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F80 不得被 F90 的普通怪降档影响");
  assert.equal(buildAbyssMap(80).monsterSpawns.length, 12, "F80 不得被 F90 的缩减影响");
});

test("回归10 F99 单层降档：普通怪 ×0.75/0.75/0.8，F98/F100 不受影响", () => {
  const f99 = buildAbyssMap(99);
  assert.deepEqual(f99.normalTuning, { hp: 0.75, attack: 0.75, defense: 0.8 }, "F99 普通怪必须按单层降档系数结算");
  assert.equal(f99.monsterSpawns.length, 12, "F99 只降数值，不减刷怪营位");
  assert.deepEqual(buildAbyssMap(98).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F98 不得被 F99 降档影响");
  assert.deepEqual(buildAbyssMap(100).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F100 不得被 F99 降档影响");
  // 深渊化怪仍保留强化（1.6×0.75=1.2），不是把整层改成普通怪。
  const deep = f99.monsterTypes.find((type) => type.deepTuned);
  assert.ok(deep, "F99 仍应有深渊化怪");
  const base = f99.monsterTypes.find((type) => !type.deepTuned);
  assert.ok(deep.hp > base.hp, "深渊化怪 HP 必须仍高于同层普通怪");
});

test("回归11 F100/F110 回响降档与 6 营位：F100 ×0.85、F110 起 ×0.65", () => {
  const f100 = buildAbyssMap(100);
  const base = generatedMap(95);
  assert.equal(f100.boss.hp, Math.round(base.boss.hp * 1.25 * 0.85), "F100 回响应在首领档上再乘 0.85");
  assert.equal(Math.round(f100.boss.hp * abyssMultipliers(100).hp), 145710, "F100 回响实体 HP 应为约 145710");
  assert.equal(f100.boss.phases, 3, "F100 仍是三阶段回响");
  assert.equal(f100.monsterSpawns.length, 6, "F100 应只保留 6 个刷怪营位（5 任务怪 + 1 巡逻压力）");
  assert.equal(
    f100.routePlan.encounterBands.reduce((sum, band) => sum + band.count, 0),
    6,
    "F100 routePlan 的计数必须与实际 6 营位一致"
  );
  assert.deepEqual(f100.normalTuning, { hp: 1, attack: 1, defense: 1 }, "F100 普通怪不得被回响降档影响");
  assert.equal(buildAbyssMap(90).boss.hp, Math.round(base.boss.hp * 0.9), "F90 回响降档不得被 F100 影响");
  // 0.8.90：F110 从 187436 收到 121836（1.25×0.65），F120 起同档。
  const f110 = buildAbyssMap(110);
  assert.equal(f110.boss.hp, Math.round(base.boss.hp * 1.25 * 0.65), "F110 起整十层回响应在首领档上乘 0.65");
  assert.equal(Math.round(f110.boss.hp * abyssMultipliers(110).hp), 121836, "F110 回响实体 HP 应为 121836");
  assert.equal(f110.monsterSpawns.length, 6, "F110 整十终局层也应只保留 6 个刷怪营位");
  assert.equal(buildAbyssMap(120).boss.hp, Math.round(base.boss.hp * 1.25 * 0.65), "F120 起沿用 F110 的 0.65 回响档");
  // 0.8.91：F120 普通怪单层降档，实体普通怪 10449–13510、深渊怪 17942–20399。
  const f120 = buildAbyssMap(120);
  assert.deepEqual(f120.normalTuning, { hp: 0.65, attack: 0.75, defense: 0.8 }, "F120 普通怪必须按单层降档系数结算");
  const f120mobs = f120.monsterTypes.map((type) => Math.round(type.hp * abyssMultipliers(120).hp));
  assert.equal(Math.min(...f120mobs.filter((_, index) => !f120.monsterTypes[index].deepTuned)), 10449, "F120 普通怪最低实体 HP 应为 10449");
  assert.equal(Math.max(...f120mobs), 20399, "F120 深渊怪最高实体 HP 应为 20399");
});

test("回归12 F105 起深层收 6 营位：早期层与 F95 不变", () => {
  const f105 = buildAbyssMap(105);
  assert.equal(f105.riftFloor, true, "F105 必须是裂隙层");
  for (const floor of [105, 106, 107, 108, 109, 111]) {
    assert.equal(buildAbyssMap(floor).monsterSpawns.length, 6, `F${floor} 深层应只保留 6 个刷怪营位`);
  }
  assert.equal(
    f105.routePlan.encounterBands.reduce((sum, band) => sum + band.count, 0),
    6,
    "F105 routePlan 的分段计数必须与 6 个营位一致"
  );
  assert.equal(buildAbyssMap(5).monsterSpawns.length, 12, "F5 早期裂隙层不得被深层收营位影响");
  assert.equal(buildAbyssMap(95).monsterSpawns.length, 12, "F95 裂隙层不得被深层收营位影响");
  assert.deepEqual(buildAbyssMap(108).normalTuning, { hp: 0.75, attack: 0.75, defense: 0.8 }, "F108 普通怪应单层降档");
  assert.deepEqual(buildAbyssMap(110).normalTuning, { hp: 0.75, attack: 0.75, defense: 0.8 }, "F110 普通怪应单层降档");
  assert.deepEqual(buildAbyssMap(107).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F107 不得被 F108 降档影响");
  assert.deepEqual(buildAbyssMap(119).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F119 不得被 F120 降档影响");
  assert.deepEqual(buildAbyssMap(121).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F121 不得被 F120 降档影响");
});

test("回归8 深渊怪档位可达：每 3 层的 spawn 里真的会出现深渊化怪档", () => {
  // 0.8.39 之前 spawn 用 tier % pick（5/6/7），而深渊怪挂在索引 pick / pick+1，
  // 永远取不到 —— 「每 3 层 2 只深渊化怪」整段配置空转。
  for (const floor of [3, 6, 9, 12]) {
    const map = buildAbyssMap(floor);
    const deepIndexes = map.monsterTypes.map((type, index) => (type.deepTuned ? index : -1)).filter((index) => index >= 0);
    assert.ok(deepIndexes.length > 0, `F${floor} 应包含深渊化怪`);
    const usedTiers = new Set(map.monsterSpawns.map((spawn) => spawn[2]));
    assert.ok(
      deepIndexes.some((index) => usedTiers.has(index)),
      `F${floor} 的刷怪点必须出现深渊怪档位 ${deepIndexes}，实际档位 ${[...usedTiers].sort((a, b) => a - b)}`
    );
  }
});
