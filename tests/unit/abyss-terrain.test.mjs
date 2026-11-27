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
import { abyssMultipliers, capAbyssBossAttack } from "../../game/src/endgame.js";

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
  // 0.8.92：F126 双深渊化层单层降档，普通怪 10028–12582、深渊怪 17801/20728。
  const f126 = buildAbyssMap(126);
  assert.deepEqual(f126.normalTuning, { hp: 0.75, attack: 0.75, defense: 0.8 }, "F126 普通怪必须按单层降档系数结算");
  const f126mobs = f126.monsterTypes.map((type) => Math.round(type.hp * abyssMultipliers(126).hp));
  assert.equal(Math.min(...f126mobs.filter((_, index) => !f126.monsterTypes[index].deepTuned)), 10028, "F126 普通怪最低实体 HP 应为 10028");
  assert.equal(Math.max(...f126mobs), 20728, "F126 深渊怪最高实体 HP 应为 20728");
  assert.deepEqual(buildAbyssMap(125).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F125 不得被 F126 降档影响");
  // 0.8.93：F127–F129 连续降档，普通怪攻击压到 774 以下，避免 1583 血玩家被两击秒杀。
  for (const floor of [127, 128, 129]) {
    const map = buildAbyssMap(floor);
    assert.deepEqual(map.normalTuning, { hp: 0.65, attack: 0.65, defense: 0.8 }, `F${floor} 普通怪必须按连续降档系数结算`);
    const hpList = map.monsterTypes.map((type) => Math.round(type.hp * abyssMultipliers(floor).hp));
    assert.ok(Math.max(...hpList) <= 20699, `F${floor} 最高实体 HP 不得超过 20699`);
    const normalAttack = map.monsterTypes
      .filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 774, `F${floor} 普通怪单次攻击不得超过 774，否则两击秒杀 1583 血玩家`);
  }
  const f127 = buildAbyssMap(127);
  const f127Hp = f127.monsterTypes.map((type) => Math.round(type.hp * abyssMultipliers(127).hp));
  assert.equal(Math.min(...f127Hp), 9334, "F127 普通怪最低实体 HP 应为 9334");
  assert.equal(Math.max(...f127Hp), 12038, "F127 普通怪最高实体 HP 应为 12038");
  const f130 = buildAbyssMap(130);
  assert.deepEqual(f130.normalTuning, { hp: 0.6, attack: 0.6, defense: 0.8 }, "F130 整十层普通怪必须再降一档");
  const f130Attack = f130.monsterTypes.map((type) => Math.round(type.attack * abyssMultipliers(130).attack));
  assert.ok(Math.max(...f130Attack) <= 717, "F130 普通怪单次攻击不得超过 717");
  // 0.8.94：F131 起换章，攻击倍率继续线性上升；F131–F137 用 0.65，F138–F139 用 0.63，F140 整十层 0.60。
  for (const floor of [131, 132, 133, 134, 135, 136, 137]) {
    const map = buildAbyssMap(floor);
    assert.deepEqual(map.normalTuning, { hp: 0.65, attack: 0.65, defense: 0.8 }, `F${floor} 普通怪必须按章节档位 0.65 结算`);
  }
  for (const floor of [138, 139]) {
    const map = buildAbyssMap(floor);
    assert.deepEqual(map.normalTuning, { hp: 0.63, attack: 0.63, defense: 0.8 }, `F${floor} 普通怪必须按 0.63 结算`);
  }
  assert.deepEqual(buildAbyssMap(140).normalTuning, { hp: 0.6, attack: 0.6, defense: 0.8 }, "F140 整十层普通怪必须按 0.60 结算");
  for (const floor of [131, 138, 139, 140]) {
    const map = buildAbyssMap(floor);
    const normalAttack = map.monsterTypes
      .filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  assert.deepEqual(buildAbyssMap(130).normalTuning, { hp: 0.6, attack: 0.6, defense: 0.8 }, "F130 不得被 0.8.95 档位影响");
  // 0.8.95：F141–F150 继续按章节档位结算，普通怪攻击全部压到 791 以下。
  for (const floor of [141, 142, 143, 144, 145, 146, 147]) {
    assert.deepEqual(
      buildAbyssMap(floor).normalTuning,
      { hp: 0.65, attack: 0.62, defense: 0.8 },
      `F${floor} 普通怪必须按章节档位 0.62 攻击结算`
    );
  }
  for (const floor of [148, 149]) {
    assert.deepEqual(buildAbyssMap(floor).normalTuning, { hp: 0.6, attack: 0.58, defense: 0.8 }, `F${floor} 普通怪必须按 0.58 攻击结算`);
  }
  assert.deepEqual(buildAbyssMap(150).normalTuning, { hp: 0.58, attack: 0.56, defense: 0.8 }, "F150 整十层普通怪必须按 0.56 攻击结算");
  for (const floor of [141, 147, 148, 149, 150]) {
    const map = buildAbyssMap(floor);
    const normalAttack = map.monsterTypes
      .filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.8.96：F151–F160 第二个十层循环，按章节分段压攻击，F161 回到默认。
  for (const floor of [151, 152, 153, 154]) {
    assert.deepEqual(buildAbyssMap(floor).normalTuning, { hp: 0.65, attack: 0.65, defense: 0.8 }, `F${floor} 普通怪必须按 0.65 攻击结算`);
  }
  assert.deepEqual(buildAbyssMap(155).normalTuning, { hp: 0.62, attack: 0.6, defense: 0.8 }, "F155 普通怪必须按 0.60 攻击结算");
  for (const floor of [156, 157, 158]) {
    assert.deepEqual(buildAbyssMap(floor).normalTuning, { hp: 0.58, attack: 0.56, defense: 0.8 }, `F${floor} 普通怪必须按 0.56 攻击结算`);
  }
  assert.deepEqual(buildAbyssMap(159).normalTuning, { hp: 0.55, attack: 0.53, defense: 0.8 }, "F159 普通怪必须按 0.53 攻击结算");
  assert.deepEqual(buildAbyssMap(160).normalTuning, { hp: 0.52, attack: 0.52, defense: 0.8 }, "F160 整十层普通怪必须按 0.52 攻击结算");
  for (const floor of [151, 154, 155, 156, 157, 158, 159, 160]) {
    const map = buildAbyssMap(floor);
    const normalAttack = map.monsterTypes
      .filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.8.97：F161–F170 第三个十层循环，逐层按章节与深淵化尖峰压档；F171 回到默认。
  const expected161to170 = {
    161: { hp: 0.65, attack: 0.68, defense: 0.8 },
    162: { hp: 0.63, attack: 0.65, defense: 0.8 },
    163: { hp: 0.62, attack: 0.67, defense: 0.8 },
    164: { hp: 0.6, attack: 0.64, defense: 0.8 },
    165: { hp: 0.55, attack: 0.6, defense: 0.8 },
    166: { hp: 0.55, attack: 0.56, defense: 0.8 },
    167: { hp: 0.53, attack: 0.54, defense: 0.8 },
    168: { hp: 0.5, attack: 0.52, defense: 0.8 },
    169: { hp: 0.52, attack: 0.51, defense: 0.8 },
    170: { hp: 0.48, attack: 0.49, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected161to170)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.8.98：F171–F180 第四个十层循环；F181 才回到默认。
  const expected171to180 = {
    171: { hp: 0.6, attack: 0.64, defense: 0.8 },
    172: { hp: 0.58, attack: 0.62, defense: 0.8 },
    173: { hp: 0.56, attack: 0.6, defense: 0.8 },
    174: { hp: 0.54, attack: 0.59, defense: 0.8 },
    175: { hp: 0.52, attack: 0.55, defense: 0.8 },
    176: { hp: 0.5, attack: 0.53, defense: 0.8 },
    177: { hp: 0.48, attack: 0.52, defense: 0.8 },
    178: { hp: 0.46, attack: 0.5, defense: 0.8 },
    179: { hp: 0.45, attack: 0.48, defense: 0.8 },
    180: { hp: 0.42, attack: 0.46, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected171to180)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.8.99：F181–F190 第五个十层循环；F191 才回到默认。
  const expected181to190 = {
    181: { hp: 0.56, attack: 0.6, defense: 0.8 },
    182: { hp: 0.54, attack: 0.58, defense: 0.8 },
    183: { hp: 0.52, attack: 0.56, defense: 0.8 },
    184: { hp: 0.5, attack: 0.54, defense: 0.8 },
    185: { hp: 0.48, attack: 0.52, defense: 0.8 },
    186: { hp: 0.46, attack: 0.5, defense: 0.8 },
    187: { hp: 0.44, attack: 0.48, defense: 0.8 },
    188: { hp: 0.42, attack: 0.46, defense: 0.8 },
    189: { hp: 0.4, attack: 0.44, defense: 0.8 },
    190: { hp: 0.38, attack: 0.42, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected181to190)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.0：F191–F200 第六个十层循环；F201 才回到默认。
  const expected191to200 = {
    191: { hp: 0.56, attack: 0.62, defense: 0.8 },
    192: { hp: 0.54, attack: 0.56, defense: 0.8 },
    193: { hp: 0.52, attack: 0.53, defense: 0.8 },
    194: { hp: 0.5, attack: 0.54, defense: 0.8 },
    195: { hp: 0.48, attack: 0.49, defense: 0.8 },
    196: { hp: 0.46, attack: 0.47, defense: 0.8 },
    197: { hp: 0.44, attack: 0.47, defense: 0.8 },
    198: { hp: 0.42, attack: 0.44, defense: 0.8 },
    199: { hp: 0.4, attack: 0.43, defense: 0.8 },
    200: { hp: 0.38, attack: 0.42, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected191to200)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.1：F201–F210 第七个十层循环；F211 才回到默认。
  const expected201to210 = {
    201: { hp: 0.56, attack: 0.55, defense: 0.8 },
    202: { hp: 0.54, attack: 0.53, defense: 0.8 },
    203: { hp: 0.52, attack: 0.52, defense: 0.8 },
    204: { hp: 0.5, attack: 0.5, defense: 0.8 },
    205: { hp: 0.48, attack: 0.48, defense: 0.8 },
    206: { hp: 0.46, attack: 0.46, defense: 0.8 },
    207: { hp: 0.44, attack: 0.45, defense: 0.8 },
    208: { hp: 0.42, attack: 0.43, defense: 0.8 },
    209: { hp: 0.4, attack: 0.41, defense: 0.8 },
    210: { hp: 0.38, attack: 0.39, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected201to210)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.2：F211–F220 第八个十层循环；F221 才回到默认。
  const expected211to220 = {
    211: { hp: 0.56, attack: 0.53, defense: 0.8 },
    212: { hp: 0.54, attack: 0.53, defense: 0.8 },
    213: { hp: 0.52, attack: 0.49, defense: 0.8 },
    214: { hp: 0.5, attack: 0.48, defense: 0.8 },
    215: { hp: 0.48, attack: 0.47, defense: 0.8 },
    216: { hp: 0.46, attack: 0.46, defense: 0.8 },
    217: { hp: 0.44, attack: 0.47, defense: 0.8 },
    218: { hp: 0.42, attack: 0.42, defense: 0.8 },
    219: { hp: 0.4, attack: 0.41, defense: 0.8 },
    220: { hp: 0.38, attack: 0.41, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected211to220)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.3：F221–F230 第九个十层循环；F231 才回到默认。
  const expected221to230 = {
    221: { hp: 0.56, attack: 0.51, defense: 0.8 },
    222: { hp: 0.54, attack: 0.49, defense: 0.8 },
    223: { hp: 0.52, attack: 0.47, defense: 0.8 },
    224: { hp: 0.5, attack: 0.46, defense: 0.8 },
    225: { hp: 0.48, attack: 0.44, defense: 0.8 },
    226: { hp: 0.46, attack: 0.43, defense: 0.8 },
    227: { hp: 0.44, attack: 0.41, defense: 0.8 },
    228: { hp: 0.42, attack: 0.41, defense: 0.8 },
    229: { hp: 0.4, attack: 0.4, defense: 0.8 },
    230: { hp: 0.38, attack: 0.38, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected221to230)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.4：F231–F240 第十个十层循环；F241 才回到默认。
  const expected231to240 = {
    231: { hp: 0.56, attack: 0.49, defense: 0.8 },
    232: { hp: 0.54, attack: 0.48, defense: 0.8 },
    233: { hp: 0.52, attack: 0.47, defense: 0.8 },
    234: { hp: 0.5, attack: 0.44, defense: 0.8 },
    235: { hp: 0.48, attack: 0.45, defense: 0.8 },
    236: { hp: 0.46, attack: 0.42, defense: 0.8 },
    237: { hp: 0.44, attack: 0.39, defense: 0.8 },
    238: { hp: 0.42, attack: 0.39, defense: 0.8 },
    239: { hp: 0.4, attack: 0.37, defense: 0.8 },
    240: { hp: 0.38, attack: 0.35, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected231to240)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.5：F241–F250 第十一个十层循环；F251 才回到默认。
  const expected241to250 = {
    241: { hp: 0.56, attack: 0.49, defense: 0.8 },
    242: { hp: 0.54, attack: 0.47, defense: 0.8 },
    243: { hp: 0.46, attack: 0.38, defense: 0.8 },
    244: { hp: 0.5, attack: 0.42, defense: 0.8 },
    245: { hp: 0.48, attack: 0.41, defense: 0.8 },
    246: { hp: 0.42, attack: 0.37, defense: 0.8 },
    247: { hp: 0.44, attack: 0.38, defense: 0.8 },
    248: { hp: 0.42, attack: 0.37, defense: 0.8 },
    249: { hp: 0.36, attack: 0.32, defense: 0.8 },
    250: { hp: 0.38, attack: 0.35, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected241to250)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
  }
  // 0.9.6：F251–F260 第十二个十层循环；F261 才回到默认。
  const expected251to260 = {
    251: { hp: 0.56, attack: 0.45, defense: 0.8 },
    252: { hp: 0.52, attack: 0.44, defense: 0.8 },
    253: { hp: 0.52, attack: 0.43, defense: 0.8 },
    254: { hp: 0.5, attack: 0.42, defense: 0.8 },
    255: { hp: 0.42, attack: 0.34, defense: 0.8 },
    256: { hp: 0.46, attack: 0.39, defense: 0.8 },
    257: { hp: 0.44, attack: 0.37, defense: 0.8 },
    258: { hp: 0.36, attack: 0.33, defense: 0.8 },
    259: { hp: 0.4, attack: 0.36, defense: 0.8 },
    260: { hp: 0.24, attack: 0.34, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected251to260)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
    const deepAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    if (deepAttack.length) assert.ok(Math.max(...deepAttack) <= 791, `F${floor} 深渊怪单次攻击不得超过 791`);
  }
  // 0.9.7：F261–F270 第十三个十层循环；F271 才回到默认。
  const expected261to270 = {
    261: { hp: 0.3, attack: 0.4, defense: 0.8 },
    262: { hp: 0.54, attack: 0.42, defense: 0.8 },
    263: { hp: 0.52, attack: 0.42, defense: 0.8 },
    264: { hp: 0.3, attack: 0.37, defense: 0.8 },
    265: { hp: 0.48, attack: 0.39, defense: 0.8 },
    266: { hp: 0.46, attack: 0.36, defense: 0.8 },
    267: { hp: 0.24, attack: 0.32, defense: 0.8 },
    268: { hp: 0.42, attack: 0.35, defense: 0.8 },
    269: { hp: 0.4, attack: 0.33, defense: 0.8 },
    270: { hp: 0.2, attack: 0.28, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected261to270)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
    const deepAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    if (deepAttack.length) assert.ok(Math.max(...deepAttack) <= 791, `F${floor} 深渊怪单次攻击不得超过 791`);
  }
  // 0.9.8：F271–F280 第十四个十层循环；F281 才回到默认。
  const expected271to280 = {
    271: { hp: 0.56, attack: 0.42, defense: 0.8 },
    272: { hp: 0.54, attack: 0.41, defense: 0.8 },
    273: { hp: 0.38, attack: 0.34, defense: 0.8 },
    274: { hp: 0.5, attack: 0.39, defense: 0.8 },
    275: { hp: 0.48, attack: 0.37, defense: 0.8 },
    276: { hp: 0.32, attack: 0.3, defense: 0.8 },
    277: { hp: 0.44, attack: 0.34, defense: 0.8 },
    278: { hp: 0.42, attack: 0.33, defense: 0.8 },
    279: { hp: 0.28, attack: 0.28, defense: 0.8 },
    280: { hp: 0.34, attack: 0.31, defense: 0.8 }
  };
  for (const [floorText, tuning] of Object.entries(expected271to280)) {
    const floor = Number(floorText);
    assert.deepEqual(buildAbyssMap(floor).normalTuning, tuning, `F${floor} 普通怪档位不符`);
    const normalAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => !type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    assert.ok(Math.max(...normalAttack) <= 791, `F${floor} 普通怪单次攻击不得超过 791，否则两击秒杀 1583 血玩家`);
    const deepAttack = buildAbyssMap(floor)
      .monsterTypes.filter((type) => type.deepTuned)
      .map((type) => Math.round(type.attack * abyssMultipliers(floor).attack));
    if (deepAttack.length) assert.ok(Math.max(...deepAttack) <= 791, `F${floor} 深渊怪单次攻击不得超过 791`);
  }
  // F210/F220/F230 的回响本体必须低于玩家满血 1583，避免任何命中都必死、药水完全失效。
  for (const floor of [210, 220, 230]) {
    const bossAttack = Math.round(buildAbyssMap(floor).boss.attack * abyssMultipliers(floor).attack);
    assert.ok(bossAttack < 1583, `F${floor} 回响攻击 ${bossAttack} 必须低于满血 1583`);
  }
  // 0.9.4：F231 起回响普攻硬上限 1,500（实体层），F240 默认 2,278 必须被压住。
  for (let floor = 231; floor <= 280; floor += 1) {
    const rawBossAttack = Math.round(buildAbyssMap(floor).boss.attack * abyssMultipliers(floor).attack);
    const cappedBossAttack = capAbyssBossAttack(floor, rawBossAttack);
    assert.ok(cappedBossAttack <= 1500, `F${floor} 回响实体攻击 ${cappedBossAttack} 必须 ≤1500`);
  }
  // F240 是第十个整十层，HP 从默认 257,043 单独降到约 221,057（0.86 倍）。
  const f240BossHp = Math.round(buildAbyssMap(240).boss.hp * abyssMultipliers(240).hp);
  assert.ok(f240BossHp > 210000 && f240BossHp < 230000, `F240 回响 HP ${f240BossHp} 应在 210k–230k`);
  // F250 是第十一个整十层，走默认 1.25×0.65，HP 约 267,444，比 F240 高约 21%。
  const f250BossHp = Math.round(buildAbyssMap(250).boss.hp * abyssMultipliers(250).hp);
  assert.ok(f250BossHp > 260000 && f250BossHp < 275000, `F250 回响 HP ${f250BossHp} 应在 260k–275k`);
  // F260 是第十二个整十层，走默认 1.25×0.65，HP 约 277,845，比 F250 高约 3.9%。
  const f260BossHp = Math.round(buildAbyssMap(260).boss.hp * abyssMultipliers(260).hp);
  assert.ok(f260BossHp > 270000 && f260BossHp < 285000, `F260 回响 HP ${f260BossHp} 应在 270k–285k`);
  // F270 是第十三个整十层，走默认 1.25×0.65，HP 约 288,245，比 F260 高约 3.7%。
  const f270BossHp = Math.round(buildAbyssMap(270).boss.hp * abyssMultipliers(270).hp);
  assert.ok(f270BossHp > 280000 && f270BossHp < 295000, `F270 回响 HP ${f270BossHp} 应在 280k–295k`);
  // 0.9.8：F276 首轮 564.1s/+43、回响剩 77,764 HP，40 次回响普攻全部命中。
  // 单独把回响 HP 压到 0.30（140,484→76,624）、攻击压到 0.28（1,500→752），保留三击压力。
  const f276BossHp = Math.round(buildAbyssMap(276).boss.hp * abyssMultipliers(276).hp);
  assert.ok(f276BossHp > 72000 && f276BossHp < 82000, `F276 回响 HP ${f276BossHp} 应在 72k–82k`);
  const f276BossAttack = Math.round(buildAbyssMap(276).boss.attack * abyssMultipliers(276).attack);
  assert.ok(f276BossAttack <= 791, `F276 回响攻击 ${f276BossAttack} 必须 ≤791，保留三击窗口`);
  for (let f = 271; f <= 280; f += 1) {
    const bossAttack = Math.round(buildAbyssMap(f).boss.attack * abyssMultipliers(f).attack);
    assert.ok(bossAttack <= 791, `F${f} 回响攻击 ${bossAttack} 必须 ≤791，保留三击窗口`);
  }
  // F280 是全轮终局：回响 HP 220,546，仍高于 F279 的 108,563；攻击 742，保留三击窗口。
  const f280BossHp = Math.round(buildAbyssMap(280).boss.hp * abyssMultipliers(280).hp);
  assert.ok(f280BossHp > 210000 && f280BossHp < 230000, `F280 回响 HP ${f280BossHp} 应在 210k–230k`);
  assert.deepEqual(buildAbyssMap(281).normalTuning, { hp: 1, attack: 1, defense: 1 }, "F281 回到默认档位");
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
