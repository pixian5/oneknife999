// 精英系统纯函数单测（0.8.13）。
// 重点不是「随机得好不好看」，而是：同图可复现、词缀条数受关卡控制、互斥规则不被抽签绕过、
// 三条数值修正（守财/追猎/狂怒/回响）在阈值两侧都有确定行为。
import test from "node:test";
import assert from "node:assert/strict";
import {
  ELITE_AFFIXES,
  ELITE_TUNING,
  ECHO_WINDOW,
  hash01,
  pickAffixes,
  rollElite,
  seededRandom,
  hasAffix,
  hoardDamageMult,
  huntSpeedMult,
  enrageGateMult,
  echoDamageMult
} from "../../game/src/elite.js";

test("hash01：同输入稳定、输出在 [0,1)", () => {
  assert.equal(hash01("stage_001:3"), hash01("stage_001:3"));
  assert.notEqual(hash01("stage_001:3"), hash01("stage_001:4"));
  for (const seed of ["a", "stage_100:0", ""]) {
    const value = hash01(seed);
    assert.ok(value >= 0 && value < 1, `${seed} → ${value}`);
  }
});

test("seededRandom：同种子序列完全一致，不同种子会分叉", () => {
  const a = seededRandom("mistwood:2");
  const b = seededRandom("mistwood:2");
  const c = seededRandom("mistwood:3");
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const value of seqA) assert.ok(value >= 0 && value < 1);
});

test("pickAffixes：抽满指定条数，且不越过互斥对", () => {
  assert.equal(pickAffixes(2, () => 0).length, 2);
  // 只有一对互斥项时，两条永远抽不满——这正是互斥该有的效果。
  const onlyMutex = pickAffixes(2, () => 0, ["enrage", "hunt"]);
  assert.deepEqual(onlyMutex, ["enrage"]);
});

test("rollElite：怪太少不刷、前 20 关 1 条、之后 2 条", () => {
  const base = { mapId: "ash_outskirts", index: 0, order: 5, random: () => 0 };
  assert.equal(rollElite({ ...base, monsterCount: 4 }), null, "少于 6 只怪不刷精英");
  const early = rollElite({ ...base, monsterCount: 10 });
  assert.equal(early.affixes.length, 1, "教学期只给 1 条词缀");
  const late = rollElite({ ...base, monsterCount: 10, order: 60 });
  assert.equal(late.affixes.length, 2, "20 关后给 2 条词缀");
  // 概率判定失败时直接返回 null，不消耗后续抽签。
  assert.equal(rollElite({ ...base, monsterCount: 10, random: () => 0.99 }), null);
  // 但「每图至少 1 只」的兜底可以绕过概率（怪太少仍然不刷）。
  const forced = rollElite({ ...base, monsterCount: 10, random: () => 0.99, force: true });
  assert.ok(forced && forced.affixes.length >= 1);
  assert.equal(rollElite({ ...base, monsterCount: 4, random: () => 0.99, force: true }), null);
});

test("rollElite：守财会带上金币奖励标记", () => {
  const elite = rollElite({ mapId: "stage_001", index: 0, monsterCount: 10, order: 30, random: () => 0 });
  // random 恒 0 时第一条抽到 enrage，第二条抽到 guardian；奖励只有当守财在列时才变金币。
  assert.equal(elite.reward, elite.affixes.includes("hoard") ? "gold" : "material");
  assert.ok(
    elite.affixes.every((id) => ELITE_AFFIXES[id]),
    "词缀必须在定义表里"
  );
});

test("守财：离开刷新点 140px 后受伤 -40%", () => {
  const entity = { elite: { affixes: ["hoard"] } };
  assert.equal(hoardDamageMult(entity, 100), 1, "地盘内不减伤");
  assert.equal(hoardDamageMult(entity, 141), 0.6);
  assert.equal(hoardDamageMult({ elite: { affixes: ["enrage"] } }, 500), 1, "无该词缀不生效");
  assert.equal(hoardDamageMult({}, 500), 1, "普通怪不报错");
});

test("追猎：常驻 +15%，玩家半血 +30%", () => {
  const entity = { elite: { affixes: ["hunt"] } };
  assert.equal(huntSpeedMult(entity, 0.8), 1.15);
  assert.equal(huntSpeedMult(entity, 0.49), 1.3);
  assert.equal(huntSpeedMult({ elite: { affixes: ["echo"] } }, 0.1), 1);
});

test("狂怒：生命 20% 以下才压缩出手闸门", () => {
  assert.equal(enrageGateMult({ elite: { affixes: ["enrage"] }, hp: 21, maxHp: 100 }), 1);
  assert.equal(enrageGateMult({ elite: { affixes: ["enrage"] }, hp: 19, maxHp: 100 }), 0.75);
  assert.equal(enrageGateMult({ elite: { affixes: ["hoard"] }, hp: 1, maxHp: 100 }), 1);
});

test("回响：只认 3 秒内的施法，窗口外不叠伤", () => {
  const entity = { elite: { affixes: ["echo"] } };
  assert.equal(echoDamageMult(entity, 0), 1.4);
  assert.equal(echoDamageMult(entity, ECHO_WINDOW - 0.01), 1.4);
  assert.equal(echoDamageMult(entity, ECHO_WINDOW + 0.01), 1);
  assert.equal(echoDamageMult(entity, 99), 1);
  assert.equal(echoDamageMult({ elite: { affixes: ["purge"] } }, 0), 1);
});

test("hasAffix：普通怪与缺字段安全返回 false", () => {
  assert.equal(hasAffix({ elite: { affixes: ["toxic"] } }, "toxic"), true);
  assert.equal(hasAffix({ elite: { affixes: ["toxic"] } }, "split"), false);
  assert.equal(hasAffix({}, "toxic"), false);
  assert.equal(hasAffix(null, "toxic"), false);
});

test("ELITE_TUNING：强度参数守住设计边界", () => {
  assert.ok(ELITE_TUNING.chance > 0 && ELITE_TUNING.chance <= 0.2, "精英比例不能失控");
  assert.ok(ELITE_TUNING.hpMult >= 1.5 && ELITE_TUNING.hpMult <= 2.5);
  assert.ok(ELITE_TUNING.attackMult <= 1.25, "攻击加成必须远低于生命加成，避免秒杀");
});
