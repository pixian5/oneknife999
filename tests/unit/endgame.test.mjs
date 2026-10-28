// 纯函数单元测试：终局与长线系统（endgame.js）。运行方式：npm run test:unit
// 0.6.0 P2：难度阶梯、无尽深层、图鉴与套装。
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTY_TIERS,
  resolveDifficulty,
  unlockedDifficulties,
  scaleForDifficulty,
  upgradeQuality,
  ABYSS_RULES,
  abyssMultipliers,
  isAbyssBossFloor,
  abyssQualityBonus,
  abyssProgress,
  recordBestiary,
  bestiaryStats,
  SET_BONUSES,
  setCounts,
  setBonusTotals,
  nextSetTier
} from "../../game/src/endgame.js";
import { MAPS } from "../../game/src/maps.js";

// ============ 难度模式 ============
test("resolveDifficulty：未解锁时回退常规难度，通关百图后解锁烬火", () => {
  assert.equal(resolveDifficulty("ember", 0).id, "normal", "未通关不能进烬火");
  assert.equal(resolveDifficulty("ember", 99).id, "normal", "99 关仍锁定");
  assert.equal(resolveDifficulty("ember", 100).id, "ember", "100 关解锁");
  assert.equal(resolveDifficulty("ashen", 129).id, "normal", "灰烬需要 130");
  assert.equal(resolveDifficulty("ashen", 130).id, "ashen");
  assert.equal(resolveDifficulty("不存在的难度", 200).id, "normal", "未知难度回退常规");
});

test("unlockedDifficulties：随通关数递增解锁数量", () => {
  assert.deepEqual(
    unlockedDifficulties(0).map((t) => t.id),
    ["normal"]
  );
  assert.deepEqual(
    unlockedDifficulties(100).map((t) => t.id),
    ["normal", "ember"]
  );
  assert.deepEqual(
    unlockedDifficulties(200).map((t) => t.id),
    ["normal", "ember", "ashen"]
  );
});

test("scaleForDifficulty：常规难度倍率恒为 1（行为不变），高级难度放大数值", () => {
  const normal = resolveDifficulty("normal", 0);
  assert.deepEqual(scaleForDifficulty({ hp: 100, attack: 50, exp: 10 }, normal), { hp: 100, attack: 50, exp: 10 });
  const ember = resolveDifficulty("ember", 100);
  assert.equal(scaleForDifficulty({ hp: 100, attack: 50, exp: 10 }, ember).hp, 150);
  assert.equal(scaleForDifficulty({ hp: 100, attack: 50, exp: 10 }, ember).attack, 70);
  assert.equal(scaleForDifficulty({ hp: 100, attack: 50, exp: 10 }, ember).exp, 13, "经验 +25%");
  // 缺省难度参数按常规处理，不抛错。
  assert.deepEqual(scaleForDifficulty({ hp: 10, attack: 5 }), { hp: 10, attack: 5, exp: 0 });
});

test("upgradeQuality：逐档提升并封顶橙", () => {
  assert.equal(upgradeQuality("white", 1), "blue");
  assert.equal(upgradeQuality("blue", 2), "orange");
  assert.equal(upgradeQuality("purple", 1), "orange");
  assert.equal(upgradeQuality("orange", 5), "orange", "封顶");
  assert.equal(upgradeQuality("white", 0), "white", "零加成不变");
  assert.equal(upgradeQuality("unknown", 3), "unknown", "未知品质原样返回");
});

// ============ 无尽深层 ============
test("abyssMultipliers：层数越高数值越强，第 0 层恒为 1", () => {
  assert.deepEqual(abyssMultipliers(0), { hp: 1, attack: 1, exp: 1 });
  const f10 = abyssMultipliers(10);
  assert.ok(f10.hp > 2 && f10.hp < 2.5, `第 10 层生命倍率约 2.4，实际 ${f10.hp}`);
  assert.ok(abyssMultipliers(50).attack > abyssMultipliers(10).attack, "越深越强");
  assert.deepEqual(abyssMultipliers(-5), { hp: 1, attack: 1, exp: 1 }, "负数按 0 处理");
});

test("isAbyssBossFloor：每 10 层一个 Boss", () => {
  assert.equal(isAbyssBossFloor(10), true);
  assert.equal(isAbyssBossFloor(20), true);
  assert.equal(isAbyssBossFloor(9), false);
  assert.equal(isAbyssBossFloor(15), false);
  assert.equal(isAbyssBossFloor(0), false);
});

test("abyssQualityBonus 与 abyssProgress：品质随深度提升、百图通关才解锁", () => {
  assert.equal(abyssQualityBonus(0), 0);
  assert.equal(abyssQualityBonus(7), 1, "floor(7*0.15)=1");
  assert.equal(abyssQualityBonus(20), 3);
  assert.deepEqual(abyssProgress({ clearedMaps: 99 }), { unlocked: false, bestFloor: 0, nextFloor: 1 });
  const unlocked = abyssProgress({ clearedMaps: 100, bestFloor: 7 });
  assert.equal(unlocked.unlocked, true);
  assert.equal(unlocked.nextFloor, 8);
});

// ============ 图鉴 ============
test("recordBestiary：累加击杀次数且不修改入参", () => {
  const first = recordBestiary({}, "林皮蛛");
  assert.equal(first["林皮蛛"], 1);
  const second = recordBestiary(first, "林皮蛛");
  assert.equal(second["林皮蛛"], 2);
  assert.equal(first["林皮蛛"], 1, "原对象不被修改");
  assert.deepEqual(recordBestiary({}, ""), {}, "空名不记录");
});

test("bestiaryStats：按全部怪物名统计完成度与缺失清单", () => {
  const stats = bestiaryStats({ 林皮蛛: 3, 赤牙猎犬: 1 }, ["林皮蛛", "赤牙猎犬", "灰烬侦察者"]);
  assert.equal(stats.seen, 2);
  assert.equal(stats.total, 3);
  assert.ok(Math.abs(stats.ratio - 2 / 3) < 1e-9);
  assert.deepEqual(stats.missing, ["灰烬侦察者"]);
  assert.deepEqual(bestiaryStats({}, []), { seen: 0, total: 0, ratio: 0, missing: [] });
});

test("图鉴覆盖：全部游戏内怪物名都能被统计（与 maps.js 对齐）", () => {
  const names = new Set();
  for (const map of Object.values(MAPS)) for (const type of map.monsterTypes) names.add(type.name);
  const all = [...names];
  const bestiary = Object.fromEntries(all.map((n) => [n, 1]));
  const stats = bestiaryStats(bestiary, all);
  assert.equal(stats.seen, stats.total, "全收集时完成度 100%");
  assert.equal(stats.missing.length, 0);
});

// ============ 套装 ============
test("setCounts：按 setKey 统计件数，无套装装备不计", () => {
  const equipment = {
    weapon: { setKey: "边境" },
    neck: { setKey: "边境" },
    helmet: { setKey: "苍月" },
    armor: {},
    boots: null
  };
  assert.deepEqual(setCounts(equipment), { 边境: 2, 苍月: 1 });
  assert.deepEqual(setCounts({}), {});
});

test("setBonusTotals：2/4/6 件取最高档，不叠加低档", () => {
  const mk = (n, key = "边境") => Object.fromEntries(Array.from({ length: n }, (_, i) => [`slot${i}`, { setKey: key }]));
  // 边境 2 件：攻击 +12
  assert.deepEqual((({ attack, hp, defense }) => ({ attack, hp, defense }))(setBonusTotals(mk(2))), { attack: 12, hp: 0, defense: 0 });
  // 边境 4 件：取 4 件档（生命 +120 / 防御 +8），不与 2 件档叠加
  const four = setBonusTotals(mk(4));
  assert.equal(four.attack, 0, "4 件档不含攻击，不叠加 2 件档的 +12");
  assert.equal(four.hp, 120);
  assert.equal(four.defense, 8);
  // 6 件：攻击 +40 / 生命 +300 / 防御 +20
  const six = setBonusTotals(mk(6));
  assert.deepEqual({ attack: six.attack, hp: six.hp, defense: six.defense }, { attack: 40, hp: 300, defense: 20 });
  assert.equal(six.active[0].tier, 6);
});

test("setBonusTotals：多套装同时生效、1 件不触发、未知套装忽略", () => {
  const equipment = {
    a: { setKey: "边境" },
    b: { setKey: "边境" },
    c: { setKey: "帝陵" },
    d: { setKey: "帝陵" },
    e: { setKey: "不存在的套装" },
    f: { setKey: "苍月" }
  };
  const totals = setBonusTotals(equipment);
  // 边境 2 件档攻击 +12，帝陵 2 件档（攻击 +20 / 防御 +8）
  assert.equal(totals.attack, 32);
  assert.equal(totals.defense, 8);
  assert.equal(totals.active.length, 2, "两块套装生效，苍月只有 1 件不触发");
});

test("nextSetTier：提示离下一档还差几件", () => {
  assert.deepEqual(nextSetTier(0), { tier: 2, missing: 2 });
  assert.deepEqual(nextSetTier(2), { tier: 4, missing: 2 });
  assert.deepEqual(nextSetTier(5), { tier: 6, missing: 1 });
  assert.equal(nextSetTier(6), null, "满套后无下一档");
});

test("SET_BONUSES 与地图掉落 setKey 对齐（无孤儿套装）", () => {
  const dropSets = new Set();
  for (const map of Object.values(MAPS)) for (const drop of map.drops || []) if (drop.setKey) dropSets.add(drop.setKey);
  for (const key of dropSets) assert.ok(SET_BONUSES[key], `掉落里的套装「${key}」必须有加成定义`);
  for (const [key, tiers] of Object.entries(SET_BONUSES)) {
    assert.ok(Array.isArray(Object.keys(tiers).map(Number)), key);
    assert.deepEqual(Object.keys(tiers).map(Number).sort(), [2, 4, 6], `${key} 应有 2/4/6 三档`);
  }
});

test("DIFFICULTY_TIERS：等级递进且常规档倍率恒为 1", () => {
  assert.equal(DIFFICULTY_TIERS[0].id, "normal");
  assert.equal(DIFFICULTY_TIERS[0].monsterHp, 1);
  assert.equal(DIFFICULTY_TIERS[0].monsterAttack, 1);
  for (let i = 1; i < DIFFICULTY_TIERS.length; i += 1) {
    assert.ok(DIFFICULTY_TIERS[i].monsterHp > DIFFICULTY_TIERS[i - 1].monsterHp, "难度越高生命倍率越大");
    assert.ok(DIFFICULTY_TIERS[i].unlockAt > DIFFICULTY_TIERS[i - 1].unlockAt, "解锁门槛递增");
  }
  assert.equal(ABYSS_RULES.bossEvery, 10);
});
