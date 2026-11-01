// 怪物行为「配置 → 结算」契约测试（0.8.12）。
//
// 由来：blind 曾长期只有定义、没有消费点（0.7.1 才接上）；0.8.11 全量复核又发现
// enrageLowHp.speedBonus 从未被读取、packHunt.range 被硬编码 260 覆盖、rageStack 把
// 「攻速」参数乘到了伤害上。这类缺陷不报错、不掉帧，只会让配置与实机强度悄悄脱节。
//
// 这里把消费链变成可执行契约：
//   1. 每个被动 id 必须在 CONSUMERS 里登记「结算符号 + 读取的参数名」；
//   2. 登记的符号与参数名必须真的出现在结算源码（monster-abilities 纯函数区 + main.js）；
//   3. 新增被动 / 参数却没登记，测试直接失败——强制作者想清楚它在哪被消费。
//
// 局限：`ratio` / `max` / `chance` 这类通用词在源码里遍地都是，扫描只能证明「词出现过」，
// 不能证明「本被动读到的是它」。因此真正防错的是第 1 条（登记即声明），扫描只是兜底。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MONSTER_ABILITIES, PASSIVE_IDS, PASSIVE_PARAMS, ATTACK_SHAPES } from "../../game/src/monster-abilities.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const ABILITIES_SRC = read("../../game/src/monster-abilities.js");
const MAIN_SRC = read("../../game/src/main.js");
// 纯函数区：PASSIVE_PARAMS 定义之后的部分才是「读参数」的地方，定义行本身不算消费。
const CONSUME_SRC = ABILITIES_SRC.slice(ABILITIES_SRC.indexOf("// ============ 纯函数")) + "\n" + MAIN_SRC;

// 被动 → 结算符号 + 该被动实际读取的参数名。
// 新增参数时，这里不补登记，契约测试就红。
const CONSUMERS = {
  poison: { symbol: "rollPassive", params: ["stacks", "chance"] },
  slow: { symbol: "slowTimer", params: ["duration", "factor", "chance"] },
  stun: { symbol: "attackTimer", params: ["duration", "chance"] },
  shieldCycle: { symbol: "shieldCooldown", params: ["cooldown", "amount"] },
  firstHitReduce: { symbol: "applyDefensePassives", params: ["ratio"] },
  lowHpReduce: { symbol: "applyDefensePassives", params: ["threshold", "ratio"] },
  meleeReflect: { symbol: "reflectDamage", params: ["ratio"] },
  lethalSave: { symbol: "resolveLethalSave", params: ["hpRatio"] },
  enrageLowHp: { symbol: "enrageMultiplier", params: ["threshold", "damageBonus", "speedBonus"] },
  packHunt: { symbol: "packHuntMultiplier", params: ["perAlly", "max", "range"] },
  rageStack: { symbol: "attackShapeConfig", params: ["damagePerStack", "speedPerStack", "max"] },
  lowHpDamageUp: { symbol: "lowHpDamageMultiplier", params: ["maxBonus"] },
  deathPoison: { symbol: "resolveOnDeath", params: ["radius", "damage", "delay"] },
  deathRevive: { symbol: "resolveOnDeath", params: ["hpRatio"] },
  blind: { symbol: "rollBlindMiss", params: ["duration", "missChance"] },
  resourceDrain: { symbol: "resourceDrain", params: ["ratio"] },
  potionLock: { symbol: "potionLock", params: ["duration"] },
  skillLock: { symbol: "skillLock", params: ["duration"] }
};

const passiveIdOf = (item) => (typeof item === "string" ? item : item?.id);

test("行为表：所有被动的 id / 形态 / 亡语都在定义表内", () => {
  const known = new Set(Object.keys(PASSIVE_IDS));
  for (const [name, cfg] of Object.entries(MONSTER_ABILITIES)) {
    for (const item of cfg.passives || []) {
      assert.ok(known.has(passiveIdOf(item)), `${name} 引用了未定义的被动 ${passiveIdOf(item)}`);
    }
    assert.ok(ATTACK_SHAPES[cfg.attack], `${name} 的攻击形态 ${cfg.attack} 不存在`);
    if (cfg.onDeath) assert.ok(["deathPoison", "deathRevive"].includes(cfg.onDeath), `${name} 的亡语 ${cfg.onDeath} 不存在`);
  }
});

test("行为表：每个被动至少被一只怪使用，且键名不互为后缀", () => {
  const used = new Set();
  for (const cfg of Object.values(MONSTER_ABILITIES)) {
    for (const item of cfg.passives || []) used.add(passiveIdOf(item));
    // 亡语挂在 onDeath 上，同样算「被使用」。
    if (cfg.onDeath) used.add(cfg.onDeath);
  }
  const unused = Object.keys(PASSIVE_IDS).filter((id) => !used.has(id));
  assert.deepEqual(unused, [], `有被动定义了却没挂到任何怪：${unused.join(", ")}`);
  const keys = Object.keys(MONSTER_ABILITIES);
  const collided = [];
  for (const a of keys) for (const b of keys) if (a !== b && a.endsWith(b)) collided.push(`${a} ⊃ ${b}`);
  assert.deepEqual(collided, [], `resolveAbilities 用 endsWith 匹配，互为后缀会串味：${collided.join(" | ")}`);
});

test("契约：每个被动 id 都登记了消费符号，且符号真的出现在结算代码里", () => {
  for (const id of Object.keys(PASSIVE_IDS)) {
    const entry = CONSUMERS[id];
    assert.ok(entry, `被动 ${id} 未登记消费点（CONSUMERS 里补上）`);
    assert.ok(CONSUME_SRC.includes(entry.symbol), `被动 ${id} 的消费符号 ${entry.symbol} 在结算代码里找不到`);
  }
  const stale = Object.keys(CONSUMERS).filter((id) => !PASSIVE_IDS[id]);
  assert.deepEqual(stale, [], `CONSUMERS 里有已删除的被动：${stale.join(", ")}`);
});

test("契约：PASSIVE_PARAMS 的每个参数都被登记且能在结算代码中找到", () => {
  for (const [id, params] of Object.entries(PASSIVE_PARAMS)) {
    const entry = CONSUMERS[id];
    assert.ok(entry, `参数组 ${id} 没有对应被动登记`);
    assert.deepEqual(
      Object.keys(params).sort(),
      [...entry.params].sort(),
      `${id} 的参数清单与登记不一致（新增/删除了字段却没改 CONSUMERS）`
    );
    for (const key of Object.keys(params)) {
      assert.ok(CONSUME_SRC.includes(key), `参数 ${id}.${key} 在结算代码里没有任何读取点`);
    }
  }
});

test("契约：修罗怒的攻速与增伤是两个独立参数，不再共用同一字段", () => {
  const rage = PASSIVE_PARAMS.rageStack;
  assert.ok(rage.speedPerStack > 0, "攻速字段必须保留");
  assert.ok(rage.damagePerStack > 0, "增伤字段必须保留");
  assert.notEqual(rage.speedPerStack, undefined);
  assert.equal(rage.attackSpeedPerStack, undefined, "旧的语义错配字段应删除");
});
