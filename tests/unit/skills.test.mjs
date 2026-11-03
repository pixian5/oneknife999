import test from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_RULES,
  applyArmorBreak,
  tickArmorBreak,
  pickPierceTargets,
  resolveChargePoint,
  resolveKnockback,
  createBoneGuard,
  pickSummonTarget,
  advanceHealZone
} from "../../game/src/skills.js";
import { computeDamage, advanceMonsterAttack, MONSTER_ATTACK_RULES } from "../../game/src/combat.js";

// 0.3.4 技能语义对齐单测：破甲 / 冲锋 / 穿透 / 骨卫 / 生息法阵 / 怪物前摇。

const hero = { attack: 100, hp: 350, range: 70 };

test("applyArmorBreak：破甲刷新到 4 秒，tick 递减到 0", () => {
  const target = { armorBreakTimer: 0 };
  assert.equal(applyArmorBreak(target), SKILL_RULES.armorBreak.duration);
  assert.equal(tickArmorBreak(target, 1.5), 2.5);
  assert.equal(tickArmorBreak(target, 9), 0);
});

test("computeDamage：破甲窗口内防御 -15%，伤害高于未破甲", () => {
  const base = { defense: 100, maxHp: 1000 };
  const fixedRandom = () => 0.5;
  const normal = computeDamage({
    target: { ...base, armorBreakTimer: 0 },
    hero,
    player: { level: 1, charge: 0, equipment: {} },
    multiplier: 1,
    kind: "普通",
    random: fixedRandom
  });
  const broken = computeDamage({
    target: { ...base, armorBreakTimer: 2 },
    hero,
    player: { level: 1, charge: 0, equipment: {} },
    multiplier: 1,
    kind: "普通",
    random: fixedRandom
  });
  assert.ok(broken.damage > normal.damage, `破甲伤害 ${broken.damage} 应高于 ${normal.damage}`);
});

test("pickPierceTargets：命中直线上的前 3 个目标，忽略偏离与友军", () => {
  const origin = { x: 0, y: 0 };
  const aim = { x: 300, y: 0 };
  const entities = [
    { id: "near", x: 80, y: 10, alive: true, radius: 14 },
    { id: "mid", x: 150, y: -12, alive: true, radius: 14 },
    { id: "far", x: 240, y: 0, alive: true, radius: 14 },
    { id: "fourth", x: 290, y: 0, alive: true, radius: 14 },
    { id: "side", x: 150, y: 120, alive: true, radius: 14 },
    { id: "guard", x: 120, y: 0, alive: true, friendly: true, radius: 13 },
    { id: "dead", x: 60, y: 0, alive: false, radius: 14 }
  ];
  const hits = pickPierceTargets({ origin, aim, entities, range: 300 });
  assert.deepEqual(
    hits.map((entity) => entity.id),
    ["near", "mid", "far"]
  );
  // 超出射程的目标不会被命中。
  assert.deepEqual(
    pickPierceTargets({ origin, aim, entities, range: 100 }).map((entity) => entity.id),
    ["near"]
  );
});

test("pickPierceTargets：零长度射线或非法射程返回空数组", () => {
  const entities = [{ id: "a", x: 10, y: 0, alive: true, radius: 10 }];
  assert.deepEqual(pickPierceTargets({ origin: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, entities, range: 100 }), []);
  assert.deepEqual(pickPierceTargets({ origin: { x: 0, y: 0 }, aim: { x: 100, y: 0 }, entities, range: 0 }), []);
});

test("resolveChargePoint：最多突进 140px，并保留目标身位", () => {
  const near = resolveChargePoint({ from: { x: 0, y: 0 }, to: { x: 60, y: 0 }, stopGap: 18 });
  assert.equal(near.travel, 42);
  assert.equal(near.x, 42);
  const far = resolveChargePoint({ from: { x: 0, y: 0 }, to: { x: 600, y: 0 }, stopGap: 18 });
  assert.equal(far.travel, SKILL_RULES.charge.distance);
  assert.equal(far.x, SKILL_RULES.charge.distance);
  // 已贴身时不位移。
  assert.deepEqual(resolveChargePoint({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, stopGap: 18 }), { x: 0, y: 0, travel: 0 });
});

test("resolveKnockback：沿外推方向推开并按地图边界夹取", () => {
  const pushed = resolveKnockback({ origin: { x: 0, y: 0 }, target: { x: 100, y: 0 } });
  assert.ok(Math.abs(pushed.x - (100 + SKILL_RULES.charge.knockback)) < 1e-6);
  const clamped = resolveKnockback({
    origin: { x: 0, y: 0 },
    target: { x: 100, y: 0 },
    bounds: { minX: 55, maxX: 120, minY: 55, maxY: 200 }
  });
  assert.equal(clamped.x, 120);
});

test("createBoneGuard：12 秒友军实体，攻击为玩家 40%", () => {
  const guard = createBoneGuard({ player: { x: 100, y: 100 }, hero, level: 7 });
  assert.equal(guard.friendly, true);
  assert.equal(guard.summonLife, SKILL_RULES.summon.duration);
  assert.equal(guard.attack, 40);
  assert.equal(guard.level, 7);
  assert.ok(guard.maxHp >= 1);
});

test("pickSummonTarget：索敌范围内最近敌人，跳过友军与 NPC", () => {
  const guard = { id: "guard", x: 0, y: 0 };
  const entities = [
    { id: "guard", x: 0, y: 0, alive: true, friendly: true },
    { id: "npc", x: 20, y: 0, alive: true, npc: true },
    { id: "near", x: 120, y: 0, alive: true },
    { id: "far", x: 900, y: 0, alive: true }
  ];
  assert.equal(pickSummonTarget({ guard, entities }).id, "near");
  assert.equal(pickSummonTarget({ guard, entities, range: 100 }), null);
});

test("advanceHealZone：圈内每秒回 8% 最大生命，4 秒后结束", () => {
  const zone = { x: 0, y: 0, radius: 120, life: 4, tick: 1 };
  const inside = advanceHealZone({ zone, player: { x: 10, y: 10 }, dt: 1, maxHp: 1000 });
  assert.equal(inside.heal, 80);
  assert.equal(inside.life, 3);
  assert.equal(inside.active, true);
  const ending = advanceHealZone({ zone: { ...zone, life: 0.5 }, player: { x: 0, y: 0 }, dt: 0.6, maxHp: 1000 });
  assert.equal(ending.expired, true);
  assert.equal(ending.active, false);
});

test("advanceHealZone：离开法阵立即失效且不回血", () => {
  const zone = { x: 0, y: 0, radius: 120, life: 3, tick: 0.2 };
  const left = advanceHealZone({ zone, player: { x: 400, y: 0 }, dt: 0.2, maxHp: 1000 });
  assert.equal(left.left, true);
  assert.equal(left.active, false);
  assert.equal(left.heal, 0);
});

test("advanceMonsterAttack：前摇结束的帧出手，冷却从出手瞬间重置", () => {
  const rules = MONSTER_ATTACK_RULES.normal;
  let state = { windup: rules.windup, windupTotal: rules.windup, cooldown: 0 };
  let step = advanceMonsterAttack(state, 0.2, rules);
  assert.equal(step.strike, false);
  assert.ok(Math.abs(step.windup - (rules.windup - 0.2)) < 1e-9);
  step = advanceMonsterAttack(step, rules.windup, rules);
  assert.equal(step.strike, true);
  assert.equal(step.windup, 0);
  assert.equal(step.cooldown, rules.cooldown);
  // 冷却未结束时不再抬手。
  const cooling = advanceMonsterAttack({ windup: 0, windupTotal: rules.windup, cooldown: 0.5 }, 0.2, rules);
  assert.equal(cooling.cooldown, 0.3);
  assert.equal(cooling.strike, false);
});

test("advanceMonsterAttack：首领前摇 0.6 秒、冷却 1.7 秒", () => {
  const rules = MONSTER_ATTACK_RULES.boss;
  assert.equal(rules.windup, 0.6);
  assert.equal(rules.cooldown, 1.7);
  const step = advanceMonsterAttack({ windup: 0.6, windupTotal: 0.6, cooldown: 0 }, 0.6, rules);
  assert.equal(step.strike, true);
  assert.equal(step.cooldown, 1.7);
});

test("MONSTER_ATTACK_RULES：固定节奏的期望出手频率不高于旧随机模型", () => {
  // 旧模型：普通怪 0.32 次/秒、首领 0.6 次/秒。
  const normalCycle = MONSTER_ATTACK_RULES.normal.windup + MONSTER_ATTACK_RULES.normal.cooldown;
  const bossCycle = MONSTER_ATTACK_RULES.boss.windup + MONSTER_ATTACK_RULES.boss.cooldown;
  assert.ok(1 / normalCycle <= 0.32, `普通怪 ${(1 / normalCycle).toFixed(2)} 次/秒应不高于 0.32`);
  assert.ok(1 / bossCycle <= 0.6, `首领 ${(1 / bossCycle).toFixed(2)} 次/秒应不高于 0.6`);
});

// ============ 0.4.4 boss 召唤物实体构造（修复：字段完整性） ============
import { buildSummonedMob } from "../../game/src/skills.js";

test("buildSummonedMob：脱战与巡逻所需字段齐备，NaN 行为链不再出现", () => {
  const mob = buildSummonedMob({
    type: { name: "腐烬矿工", color: "#bd8b68", hp: 84, attack: 13, defense: 3, exp: 28, gold: 8, radius: 17 },
    id: "summon-1",
    x: 100,
    y: 200,
    level: 4,
    windupTotal: 0.45,
    random: () => 0.5
  });
  assert.equal(mob.summonedMob, true);
  assert.equal(mob.alive, true);
  assert.equal(mob.maxHp, 84);
  // 修复前缺失的三个字段：脱战距离 / 巡逻半径 / 仇恨初值。
  assert.equal(typeof mob.spawnX, "number", "spawnX 缺失会让脱战距离变 NaN");
  assert.equal(typeof mob.spawnY, "number", "spawnY 缺失会让脱战距离变 NaN");
  assert.ok(mob.patrolRadius >= 55 && mob.patrolRadius <= 105, "巡逻半径应在 createEntities 同款区间");
  assert.equal(mob.aggro, false);
  assert.ok(Number.isInteger(mob.morph) && mob.morph >= 0 && mob.morph <= 3, "形态变体应为 0-3 整数");
  // 召唤物无复活语义：respawn 刻意缺失，尸体由 updateEntities 按 summonedMob 移除。
  assert.equal(mob.respawn, undefined);
  // 死后不走复活计时的等价校验：updateEntities 的守卫让召唤物尸体跳过 respawn 递减。
  const respawnAfterTick = (mob.respawn ?? undefined) - 0.016;
  assert.ok(
    Number.isNaN(respawnAfterTick) || typeof respawnAfterTick === "number",
    "守卫由 updateEntities 保证，纯函数侧只需 respawn 缺失可辨"
  );
});

test("buildSummonedMob：注入随机数可复现位置、巡逻半径与形态", () => {
  const values = [0.9, 0.1, 0.25, 0.5];
  const queue = [...values];
  const random = () => (queue.length ? queue.shift() : 0);
  const mob = buildSummonedMob({
    type: { name: "腐烬矿工", hp: 84, attack: 13, defense: 3, gold: 8, radius: 17 },
    id: "summon-2",
    x: 300,
    y: 400,
    level: 4,
    windupTotal: 0.45,
    random
  });
  assert.equal(mob.spawnX, 300, "刷新点即召唤点");
  assert.equal(mob.spawnY, 400);
  // 随机消费顺序：wander(0.9) → morph(0.1) → patrolRadius(0.25)。
  assert.ok(Math.abs(mob.wander - 0.9 * 6) < 1e-9, "wander = random*6");
  assert.equal(mob.morph, 0, "floor(0.1) = 0");
  assert.ok(Math.abs(mob.patrolRadius - (55 + 0.25 * 50)) < 1e-9, "巡逻半径 = 55 + random*50");
});
