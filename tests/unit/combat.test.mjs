// 纯函数单元测试：战斗结算（combat.js）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { computeDamage, computeKillReward } from "../../game/src/combat.js";

// 队列式假随机：按给定顺序返回随机值，用尽后回退为 0，保证结果完全可复现。
const queueRandom = (values) => {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0);
};

const HERO = { attack: 33 };
const MOB = { defense: 3, maxHp: 84, boss: false };
const BOSS = { defense: 18, maxHp: 900, boss: true };
const playerOf = (overrides = {}) => ({ level: 1, charge: 0, equipment: { weapon: null, neck: null, boots: null }, ...overrides });

test("computeDamage：无装备时的基础伤害 = 攻击 + 等级 ×4 后的方差与减伤结算", () => {
  // base = 33 + 1*4 = 37；random .5 → variance 1.0；reduction = 3/108
  const result = computeDamage({ target: MOB, hero: HERO, player: playerOf(), multiplier: 1, kind: "普通", random: queueRandom([0.5]) });
  assert.equal(result.damage, Math.round(37 * (1 - 3 / 108)));
  assert.equal(result.critical, false);
  assert.equal(result.chargeGain, 10, "普通怪每次受击积累 10 点破势");
});

test("computeDamage：装备战力按 90% 计入基础攻击", () => {
  const equipment = { weapon: { power: 20 }, neck: null, boots: { power: 10 } };
  const withGear = computeDamage({
    target: MOB,
    hero: HERO,
    player: playerOf({ level: 3, equipment }),
    multiplier: 1,
    kind: "普通",
    random: queueRandom([0.5])
  });
  // base = 33 + 3*4 + 30*.9 = 72；reduction = 3/(3+100+15)
  assert.equal(withGear.damage, Math.round(72 * (1 - 3 / 118)));
});

test("computeDamage：满破势时爆发技能获得 1.55 倍结算", () => {
  const normal = computeDamage({
    target: MOB,
    hero: HERO,
    player: playerOf({ charge: 100 }),
    multiplier: 2,
    kind: "普通",
    random: queueRandom([0.5])
  });
  const burst = computeDamage({
    target: MOB,
    hero: HERO,
    player: playerOf({ charge: 100 }),
    multiplier: 2,
    kind: "爆发",
    random: queueRandom([0.5])
  });
  assert.equal(burst.critical, true);
  assert.equal(burst.damage, Math.round(normal.damage * 1.55));
  const lowCharge = computeDamage({
    target: MOB,
    hero: HERO,
    player: playerOf({ charge: 99 }),
    multiplier: 2,
    kind: "爆发",
    random: queueRandom([0.5])
  });
  assert.equal(lowCharge.critical, false);
  assert.equal(lowCharge.damage, normal.damage);
});

test("computeDamage：快进模式放大 25 倍并把首领单次上限提高到 18%", () => {
  const fast = computeDamage({
    target: MOB,
    hero: HERO,
    player: playerOf(),
    multiplier: 1,
    kind: "普通",
    fastForward: true,
    random: queueRandom([0.5])
  });
  const normal = computeDamage({ target: MOB, hero: HERO, player: playerOf(), multiplier: 1, kind: "普通", random: queueRandom([0.5]) });
  assert.equal(fast.damage, normal.damage * 25);
  const bossFast = computeDamage({
    target: BOSS,
    hero: HERO,
    player: playerOf(),
    multiplier: 3.2,
    kind: "爆发",
    fastForward: true,
    random: queueRandom([0.5])
  });
  assert.equal(bossFast.damage, Math.ceil(900 * 0.18), "首领快进上限 = maxHp 的 18%");
});

test("computeDamage：首领单次受击不超过 3.5% 最大生命且破势只加 7", () => {
  const result = computeDamage({ target: BOSS, hero: HERO, player: playerOf(), multiplier: 3.2, kind: "爆发", random: queueRandom([0.5]) });
  assert.equal(result.damage, Math.ceil(900 * 0.035));
  assert.equal(result.chargeGain, 7);
});

test("computeDamage：伤害下限为 1，随机数由调用方注入", () => {
  const result = computeDamage({
    target: { defense: 999, maxHp: 10 },
    hero: { attack: 1 },
    player: playerOf({ level: 1 }),
    multiplier: 1,
    kind: "普通",
    random: queueRandom([0])
  });
  assert.equal(result.damage, 1);
});

test("computeKillReward：普通怪只有首次进度击杀给经验", () => {
  const rule = { kills: 8, mapsPerLevel: 1 };
  const first = computeKillReward({ target: MOB, quest: { kills: 0, need: 8, bossDefeated: false }, rule });
  assert.deepEqual(first, {
    firstProgressKill: true,
    expGain: Math.max(1, Math.floor(70 / rule.mapsPerLevel / rule.kills)),
    marksGain: 0,
    chargeGain: 12,
    resourceGainRatio: 0.08
  });
  const repeat = computeKillReward({ target: MOB, quest: { kills: 8, need: 8, bossDefeated: false }, rule });
  assert.equal(repeat.firstProgressKill, false);
  assert.equal(repeat.expGain, 0);
});

test("computeKillReward：首领首次击杀给 35 印记、32 破势与按地图数折算的经验", () => {
  const reward = computeKillReward({
    target: BOSS,
    quest: { kills: 8, need: 8, bossDefeated: false },
    rule: { kills: 8, mapsPerLevel: 4 }
  });
  assert.equal(reward.firstProgressKill, true);
  assert.equal(reward.expGain, Math.round(30 / 4));
  assert.equal(reward.marksGain, 35);
  assert.equal(reward.chargeGain, 32);
  const again = computeKillReward({ target: BOSS, quest: { kills: 8, need: 8, bossDefeated: true }, rule: { kills: 8, mapsPerLevel: 4 } });
  assert.equal(again.firstProgressKill, false);
  assert.equal(again.expGain, 0);
  assert.equal(again.marksGain, 35, "重复击杀首领仍给印记（刷新后击杀）");
});
