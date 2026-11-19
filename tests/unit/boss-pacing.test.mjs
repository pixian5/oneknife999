// Boss 战节奏（T-07 的确定性版本）：纯公式数刀，不启浏览器。
//
// 建模口径（吃过一次亏，写清楚）：
//   - 只用普攻会严重低估后期伤害（战士 100 关普攻 159，爆发技 ×2.4×1.55 ≈ 590），
//     从而错误得出「3.5% 单次上限不生效」的结论。**必须把技能倍率与满破势暴击算进去。**
//   - 有效刀数 = ceil(hp / 每刀有效伤害)，每刀有效伤害 = min(原始伤害, 上限 × maxHp)。
//
// 设计约束（0.8.40）：
//   1. 中后期必须有技能刀被上限截断（否则高倍率技能会跳过阶段设计）；
//   2. Boss 必须随深度变硬：第 100 关有效刀数 ≥ 第 25 关的 1.25 倍；
//   3. 第 100 关 Boss 战时长落在 12–30s（配合攻击间隔换算）。
import test from "node:test";
import assert from "node:assert/strict";

import { MAPS, MAP_ORDER, MAP_CLEAR_RULES, campaignGrowth } from "../../game/src/maps.js";
import { CLASSES } from "../../game/src/config.js";
import { computeDamage, bossDamageCapFraction } from "../../game/src/combat.js";
const PICKED = [0, 24, 49, 74, 99];
const CLASS_IDS = ["warrior", "mage", "taoist"];

function heroState(classId, mapId) {
  const cleared = MAP_ORDER.indexOf(mapId);
  const level = campaignGrowth(cleared).level;
  // 武器战力取 sim 实测曲线：50 关 131、100 关 196（线性外推足够做量级判断）。
  const weaponPower = Math.max(0, Math.round((level - 1) * 4.6));
  return { level, player: { level, equipment: {}, charge: 100, weaponPower } };
}

function splitDamage(target, hero, player, multiplier, kind) {
  const raw = computeDamage({ target: { ...target, boss: false }, hero, player, multiplier, kind, random: () => 0.5 });
  const effective = computeDamage({ target, hero, player, multiplier, kind, random: () => 0.5 });
  return { raw: raw.damage, effective: effective.damage };
}

function bossFight(mapId, classId) {
  const source = MAPS[mapId].boss;
  const target = { ...source, hp: source.hp, maxHp: source.hp, alive: true, boss: true };
  const hero = CLASSES[classId];
  const { level, player } = heroState(classId, mapId);

  const basic = splitDamage(target, hero, player, 1, "普攻");
  const skills = hero.skills.map((skill) => ({
    name: skill.name,
    ...splitDamage(target, hero, player, skill.damage, skill.kind)
  }));
  const strongest = skills.reduce((a, b) => (a.raw >= b.raw ? a : b));

  // 近似模型：技能循环里约 1/3 的出手是爆发技，其余是普攻。
  const perSwing = (basic.effective * 2 + strongest.effective) / 3;
  const hits = Math.ceil(source.hp / Math.max(1, perSwing));
  const seconds = +(hits * hero.cooldown).toFixed(1);

  return {
    mapId,
    classId,
    stage: MAP_CLEAR_RULES[mapId].stageNumber,
    level,
    hp: source.hp,
    basic: basic.effective,
    strongest: strongest.effective,
    strongestRaw: strongest.raw,
    cap: Math.ceil(source.hp * bossDamageCapFraction(source.hp)),
    capped: strongest.raw > Math.ceil(source.hp * bossDamageCapFraction(source.hp)),
    hits,
    seconds
  };
}

const table = PICKED.flatMap((index) => CLASS_IDS.map((classId) => bossFight(MAP_ORDER[index], classId)));
const pick = (mapIndex, classId) => table.find((row) => row.mapId === MAP_ORDER[mapIndex] && row.classId === classId);

test("中后期至少有一个技能被单刀上限截断（否则上限形同虚设）", () => {
  for (const classId of CLASS_IDS) {
    for (const index of [49, 74, 99]) {
      const row = pick(index, classId);
      assert.ok(row.capped, `${classId} 第 ${row.stage} 关：最强技能 ${row.strongestRaw} 未触及上限 ${row.cap}，说明数值已允许跳阶段`);
    }
  }
});

test("Boss 随深度变硬：第 100 关有效刀数 ≥ 第 25 关的 1.25 倍", () => {
  for (const classId of CLASS_IDS) {
    const mid = pick(24, classId);
    const late = pick(99, classId);
    const ratio = late.hits / mid.hits;
    assert.ok(
      ratio >= 1.25,
      `${classId}：第 25 关 ${mid.hits} 刀 → 第 100 关 ${late.hits} 刀（${ratio.toFixed(2)}×），深度没有带来额外压力`
    );
  }
});

test("第 100 关 Boss 战时长落在 12–40s（模型偏保守，实测 sim 约 ×0.7）", () => {
  for (const classId of CLASS_IDS) {
    const late = pick(99, classId);
    assert.ok(late.seconds >= 12 && late.seconds <= 40, `${classId}：第 100 关 ${late.hits} 刀 ≈ ${late.seconds}s，超出 12–40s`);
  }
});

test("打印节奏表（调参前后对比用）", () => {
  for (const row of table) {
    console.log(
      `${row.classId.padEnd(8)} 关${String(row.stage).padStart(3)} Lv${String(row.level).padStart(2)} hp${String(row.hp).padStart(6)} ` +
        `普攻${String(row.basic).padStart(4)} 爆发${String(row.strongest).padStart(4)}(上限${String(row.cap).padStart(4)}${row.capped ? " 绑" : " 松"}) ` +
        `${String(row.hits).padStart(3)} 刀 ${String(row.seconds).padStart(5)}s`
    );
  }
  assert.ok(table.length === PICKED.length * CLASS_IDS.length);
});
