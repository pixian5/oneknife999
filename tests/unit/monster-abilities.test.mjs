// 纯函数单元测试：怪物行为原语（monster-abilities.js）。运行方式：npm run test:unit
// 0.6.0 P0：把 config 里 56 种怪的行为描述落成可执行配置后的行为校验。
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTACK_SHAPES,
  PASSIVE_PARAMS,
  MONSTER_ABILITIES,
  resolveAbilities,
  attackShapeConfig,
  rollPassive,
  rollBlindMiss,
  applyDefensePassives,
  reflectDamage,
  resolveLethalSave,
  packHuntMultiplier,
  lowHpDamageMultiplier,
  enrageMultiplier,
  resolveOnDeath
} from "../../game/src/monster-abilities.js";
import { MAPS } from "../../game/src/maps.js";
import { MONSTER_BEHAVIORS } from "../../game/src/config.js";

test("resolveAbilities：按名字精确匹配与章节前缀 suffix 匹配都能解析", () => {
  const exact = resolveAbilities("林皮蛛");
  assert.equal(exact.attack, "normal");
  assert.deepEqual(
    exact.passives.map((p) => p.id),
    ["poison", "slow"]
  );
  // 生成图为「冰封冰壳魔」，行为表键为「冰壳魔」。
  const prefixed = resolveAbilities("冰封冰壳魔");
  assert.equal(prefixed.base, "冰壳魔");
  assert.equal(prefixed.attack, "sweep");
  assert.ok(prefixed.passives.some((p) => p.id === "shieldCycle"));
});

test("resolveAbilities：未配置的怪回退普通行为，不抛错", () => {
  const unknown = resolveAbilities("不存在的怪物名");
  assert.equal(unknown.attack, "normal");
  assert.deepEqual(unknown.passives, []);
  assert.equal(unknown.onDeath, null);
});

test("resolveAbilities：被动可覆盖默认参数", () => {
  const lib = { 测试怪: { attack: "normal", passives: [{ id: "poison", stacks: 3 }] } };
  const result = resolveAbilities("测试怪", lib);
  assert.equal(result.passives[0].params.stacks, 3, "覆盖值生效");
  assert.equal(result.passives[0].params.chance, PASSIVE_PARAMS.poison.chance, "未覆盖的字段保留默认");
});

test("游戏内全部怪物都能解析出行为（无遗漏、无异常形态）", () => {
  const names = new Set();
  for (const map of Object.values(MAPS)) for (const type of map.monsterTypes) names.add(type.name);
  let configured = 0;
  for (const name of names) {
    const abilities = resolveAbilities(name);
    assert.ok(ATTACK_SHAPES[abilities.attack], `${name} 的形态 ${abilities.attack} 必须合法`);
    if (abilities.base) configured += 1;
  }
  // 全部 56 种怪都有配置（名字集合去重后应全部命中）。
  assert.equal(configured, names.size, `应全部命中，实际 ${configured}/${names.size}`);
});

test("MONSTER_BEHAVIORS schema 已统一为对象（0.6.0 清理双 schema）", () => {
  for (const [name, entry] of Object.entries(MONSTER_BEHAVIORS)) {
    assert.ok(!Array.isArray(entry), `${name} 不应是数组形式`);
    assert.ok(Array.isArray(entry.skills), `${name} 应有 skills 数组`);
  }
});

test("attackShapeConfig：多段 / 蓄力 / 远程 / 冲锋 / 横扫的差异可量化", () => {
  const normal = attackShapeConfig("normal");
  const multi3 = attackShapeConfig("multi3");
  const heavy = attackShapeConfig("heavy");
  const ranged = attackShapeConfig("ranged");
  const sweep = attackShapeConfig("sweep");
  assert.equal(multi3.multiHit, 3, "三段连击");
  assert.equal(normal.multiHit, 1);
  assert.ok(heavy.damageMult > normal.damageMult, "蓄力重击伤害更高");
  assert.ok(heavy.knockback > 0, "蓄力重击可击退");
  // 0.6.0 调平：远程从 2.4 倍降到 1.9 倍；0.7.5 再降到 1.6 倍（仍显著大于基础射程）。
  assert.ok(ranged.rangeMult > normal.rangeMult * 1.4, "远程投掷距离显著更远");
  assert.ok(sweep.rangeMult > normal.rangeMult, "横扫范围更大");
  assert.equal(attackShapeConfig("pull").pulls, true, "拖拽形态标记");
});

// 0.7.5：第 30 关四臂实测证明形态系数直接决定死亡数（关形态后中位 8 死 → 1 死），
// 这里给每个放大项设上限，防止后续调参把系数悄悄加回去而没有任何信号。
test("ATTACK_SHAPES：放大系数有上限，防止难度再次失控", () => {
  const normal = attackShapeConfig("normal");
  const heavy = attackShapeConfig("heavy");
  const ranged = attackShapeConfig("ranged");
  const charge = attackShapeConfig("charge");
  const sweep = attackShapeConfig("sweep");
  assert.ok(heavy.damageMult <= 1.2, `蓄力重击伤害倍率应 ≤1.2，实际 ${heavy.damageMult}`);
  assert.ok(heavy.windupMult <= 1.5, `蓄力重击前摇倍率应 ≤1.5，实际 ${heavy.windupMult}`);
  assert.ok(heavy.knockback <= 22, `蓄力重击击退应 ≤22，实际 ${heavy.knockback}`);
  assert.ok(ranged.rangeMult <= 1.65 && ranged.rangeMult > normal.rangeMult, "远程射程应在 (1, 1.65]");
  assert.ok(charge.knockback <= 26 && charge.knockback > 0, "冲锋击退应在 (0, 26]");
  assert.ok(charge.dash <= 70, `冲锋位移应 ≤70，实际 ${charge.dash}`);
  assert.ok(sweep.rangeMult <= 1.55, `横扫射程应 ≤1.55，实际 ${sweep.rangeMult}`);
  // 0.7.5：重形态后摇更长（gateMult），持续 DPS 因此下降；段数形态不加后摇。
  const heavyGate = attackShapeConfig("heavy").gateMult;
  const chargeGate = attackShapeConfig("charge").gateMult;
  assert.ok(heavyGate > 1 && heavyGate <= 1.4, `重击后摇倍率应在 (1, 1.4]，实际 ${heavyGate}`);
  assert.ok(chargeGate > 1 && chargeGate <= 1.25, `冲锋后摇倍率应在 (1, 1.25]，实际 ${chargeGate}`);
  assert.equal(attackShapeConfig("normal").gateMult, 1, "基础近战不加后摇");
  assert.equal(attackShapeConfig("multi3").gateMult, 1, "三段连击不加后摇");
});

test("attackShapeConfig：攻速叠加提升伤害倍率", () => {
  const base = attackShapeConfig("normal", { rageStacks: 0 });
  const stacked = attackShapeConfig("normal", { rageStacks: 5 });
  assert.ok(stacked.damageMult > base.damageMult, "5 层修罗怒应提高倍率");
  assert.ok(Math.abs(stacked.damageMult - (1 + 5 * PASSIVE_PARAMS.rageStack.attackSpeedPerStack)) < 1e-9);
});

test("rollPassive：概率被动按注入随机数判定，无概率字段视为必触发", () => {
  const passives = [
    { id: "poison", params: { chance: 0.5 } },
    { id: "firstHitReduce", params: { ratio: 0.5 } }
  ];
  assert.equal(rollPassive(passives, "poison", () => 0.2).triggered, true);
  assert.equal(rollPassive(passives, "poison", () => 0.9).triggered, false);
  assert.equal(rollPassive(passives, "firstHitReduce", () => 0.99).triggered, true, "无 chance 必触发");
  assert.equal(rollPassive(passives, "nonexistent").triggered, false);
});

test("applyDefensePassives：首击减伤只生效一次，残血减伤按生命比判定", () => {
  const passives = [
    { id: "firstHitReduce", params: { ratio: 0.5 } },
    { id: "lowHpReduce", params: { threshold: 0.35, ratio: 0.3 } }
  ];
  const first = applyDefensePassives({ passives, damage: 100, ctx: { hpRatio: 1, firstHit: true } });
  assert.equal(first.damage, 50, "首击减半");
  assert.deepEqual(first.consumed, ["firstHitReduce"], "标记首击已消耗");
  const second = applyDefensePassives({ passives, damage: 100, ctx: { hpRatio: 1, firstHit: false } });
  assert.equal(second.damage, 100, "第二击不再减伤");
  const low = applyDefensePassives({ passives, damage: 100, ctx: { hpRatio: 0.2, firstHit: false } });
  assert.equal(low.damage, 70, "残血减伤 30%");
});

test("reflectDamage 与 resolveLethalSave：反伤按比例、致命保留一次", () => {
  const passives = [
    { id: "meleeReflect", params: { ratio: 0.25 } },
    { id: "lethalSave", params: { hpRatio: 0.12 } }
  ];
  assert.equal(reflectDamage(passives, 200), 50);
  assert.equal(reflectDamage([], 200), 0);
  // 伤害不足以致死：不减伤、不触发保留。
  const survived = resolveLethalSave({ passives, hp: 500, maxHp: 500, damage: 100, usedLethalSave: false });
  assert.deepEqual(survived, { hp: 400, saved: false });
  // 致死伤害：保留少量生命并标记。
  const saved = resolveLethalSave({ passives, hp: 500, maxHp: 500, damage: 900, usedLethalSave: false });
  assert.equal(saved.saved, true);
  assert.equal(saved.hp, 60, "保留 12% 最大生命（500 × 12% = 60）");
  // 低血怪不能被“保留”治疗到更高血量。
  const low = resolveLethalSave({ passives, hp: 5, maxHp: 500, damage: 10, usedLethalSave: false });
  assert.equal(low.saved, true);
  assert.equal(low.hp, 5, "低血时最多保留当前血量，不允许回血");
  // 已用过：正常死亡。
  const dead = resolveLethalSave({ passives, hp: 500, maxHp: 500, damage: 900, usedLethalSave: true });
  assert.equal(dead.saved, false);
  assert.equal(dead.hp, 0);
});

test("伤害倍率：同类增伤有上限、自身残血增伤、玩家残血增伤", () => {
  const pack = [{ id: "packHunt", params: { perAlly: 0.12, max: 0.5 } }];
  assert.equal(packHuntMultiplier(pack, 0), 1);
  assert.ok(Math.abs(packHuntMultiplier(pack, 2) - 1.24) < 1e-9);
  assert.equal(packHuntMultiplier(pack, 99), 1.5, "封顶 50%");
  assert.equal(packHuntMultiplier([], 5), 1, "无该被动不增伤");

  const lowHp = [{ id: "lowHpDamageUp", params: { maxBonus: 1.0 } }];
  assert.equal(lowHpDamageMultiplier(lowHp, 1), 1, "满血无加成");
  assert.equal(lowHpDamageMultiplier(lowHp, 0), 2, "空血翻倍");

  const enrage = [{ id: "enrageLowHp", params: { threshold: 0.4, damageBonus: 0.3 } }];
  assert.equal(enrageMultiplier(enrage, 0.8), 1, "玩家高血不触发");
  assert.equal(enrageMultiplier(enrage, 0.2), 1.3, "玩家低血增伤 30%");
});

test("rollBlindMiss：致盲期间按 missChance 落空，计时结束或概率为 0 必中", () => {
  const active = { blindTimer: 1.5, missChance: 0.3 };
  assert.equal(
    rollBlindMiss(active, () => 0.2),
    true,
    "0.2 < 0.3 应按 missChance 落空"
  );
  assert.equal(
    rollBlindMiss(active, () => 0.5),
    false,
    "0.5 > 0.3 应命中"
  );
  assert.equal(
    rollBlindMiss({ blindTimer: 0, missChance: 0.3 }, () => 0.01),
    false,
    "未致盲必中"
  );
  assert.equal(
    rollBlindMiss({ blindTimer: 1, missChance: 0 }, () => 0.01),
    false,
    "失手概率 0 必中"
  );
  assert.equal(
    rollBlindMiss(undefined, () => 0.01),
    false,
    "缺省参数必中"
  );
  assert.equal(typeof rollBlindMiss(active), "boolean", "默认随机源可用");
  // 致盲参数必须落在合理区间，避免默认值被改成 1.0 导致玩家完全打不中。
  assert.ok(PASSIVE_PARAMS.blind.missChance > 0 && PASSIVE_PARAMS.blind.missChance < 0.5, "致盲失手概率应在 (0, 0.5)");
  assert.ok(PASSIVE_PARAMS.blind.duration > 0, "致盲持续时间必须为正");
});

test("resolveOnDeath：亡语安全区生成毒区、复活返回比例、其它为无效果", () => {
  const poison = resolveOnDeath("deathPoison", { entity: { x: 10, y: 20, level: 5 } });
  assert.ok(poison.hazard, "孢子爆裂生成毒区");
  assert.equal(poison.hazard.x, 10);
  assert.equal(poison.hazard.damage, PASSIVE_PARAMS.deathPoison.damage);
  const revive = resolveOnDeath("deathRevive", { entity: {} });
  assert.equal(revive.revive.hpRatio, PASSIVE_PARAMS.deathRevive.hpRatio);
  assert.deepEqual(resolveOnDeath(null, { entity: {} }), {});
  assert.deepEqual(resolveOnDeath("unknown", { entity: {} }), {});
});

test("MONSTER_ABILITIES：第 1 章四种怪行为互不相同（同为初始关也不能千篇一律）", () => {
  const first = ["腐烬矿工", "赤牙猎犬", "裂脊尸卫", "灰烬侦察者"].map((n) => resolveAbilities(n));
  const shapes = new Set(first.map((a) => a.attack));
  assert.ok(shapes.size >= 3, `第 1 章四种怪至少三种不同形态，实际 ${[...shapes].join(",")}`);
  const passiveSets = new Set(first.map((a) => a.passives.map((p) => p.id).join(",")));
  assert.ok(passiveSets.size >= 3, "被动配置也不应雷同");
});

test("行为配置合法性：形态 id 与被动 id 全部合法（防止填入不存在的原语）", () => {
  const shapeIds = new Set(Object.keys(ATTACK_SHAPES));
  const passiveIds = new Set(Object.keys(PASSIVE_PARAMS));
  const onDeathIds = new Set(["deathPoison", "deathRevive"]);
  const invalid = [];
  for (const [name, config] of Object.entries(MONSTER_ABILITIES)) {
    if (!shapeIds.has(config.attack)) invalid.push(`${name}: 形态 ${config.attack}`);
    for (const passive of config.passives || []) {
      const id = typeof passive === "string" ? passive : passive?.id;
      if (!passiveIds.has(id)) invalid.push(`${name}: 被动 ${id}`);
    }
    if (config.onDeath && !onDeathIds.has(config.onDeath)) invalid.push(`${name}: 亡语 ${config.onDeath}`);
  }
  assert.deepEqual(invalid, [], `存在非法行为 id：${invalid.join("、")}`);
});
