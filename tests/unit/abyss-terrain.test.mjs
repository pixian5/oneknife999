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
