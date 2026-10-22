// 《一刀999》真实速度数值模拟器（无快进、无浏览器）。
// 目的：在正式速度下（不乘 25 倍伤害）验证百图数值平衡——每关死亡次数、清关耗时、
// 药水消耗、装备更换与强化收益，识别「前期过难 / 后期碾压 / 装备无效」等问题。
// 复用 game/src 纯逻辑模块：combat.js（伤害/承伤）、maps.js（地图/成长）、
// drops.js（掉落/词缀）、config.js（职业/装备），与浏览器实现共享同一套公式。
// 运行：npm run balance   （可选：node tests/balance-sim.mjs --classes=warrior,mage）
// 随机数用 mulberry32 种子注入，输出可复现。

import { MAPS, MAP_ORDER, MAP_CLEAR_RULES, campaignGrowth } from "../game/src/maps.js";
import { CLASSES, COMMON_DROPS, EQUIPMENT_SLOTS, effectiveItemPower, equipmentHpBonus, equipmentDefenseBonus } from "../game/src/config.js";
import { computeDamage, computeIncomingDamage } from "../game/src/combat.js";
import { rollDropItem, rollDropCount } from "../game/src/drops.js";
import { clamp, distance } from "../game/src/util.js";
import { writeFileSync } from "node:fs";

// ---------- 可复现随机 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 玩家状态 ----------
function createPlayer(classId) {
  const hero = CLASSES[classId];
  const equipment = Object.fromEntries(Object.keys(EQUIPMENT_SLOTS).map((key) => [key, null]));
  const player = {
    classId,
    hero,
    x: 0,
    y: 0,
    level: 1,
    exp: 0,
    nextExp: 100,
    gold: 40,
    marks: 0,
    potion: 3,
    deaths: 0,
    hp: 0,
    resource: hero.resource,
    charge: 0,
    attackTimer: 0,
    cooldowns: [0, 0, 0, 0],
    invulnerable: 0,
    equipment,
    inventory: [],
    skillPoints: 0,
    skillLevels: [0, 0, 0, 0],
    sin: 0,
    totalKills: 0,
    poison: 0,
    poisonTimer: 0,
    completedMaps: 0,
    mapProgress: {},
    // 统计
    potionUsed: 0,
    itemsPicked: 0,
    itemsEquipped: 0,
    enhanceCount: 0
  };
  player.hp = maxHp(player);
  return player;
}

function maxHp(player) {
  const bonus = Object.keys(EQUIPMENT_SLOTS).reduce((sum, slotKey) => sum + equipmentHpBonus(player.equipment[slotKey], slotKey), 0);
  return player.hero.hp + player.level * 18 + bonus;
}

function playerDefense(player) {
  return Object.keys(EQUIPMENT_SLOTS).reduce((sum, slotKey) => sum + equipmentDefenseBonus(player.equipment[slotKey]), player.hero.defense);
}

function playerWeaponPower(player) {
  return Object.values(player.equipment).reduce((sum, item) => sum + effectiveItemPower(item), 0);
}

// 装备可用性判断：非材料/消耗品/货币的物品可以穿戴。
const WEARABLE_SLOTS = new Set([
  "weapon",
  "helmet",
  "neck",
  "armor",
  "braceletL",
  "braceletR",
  "ringL",
  "ringR",
  "belt",
  "boots",
  "medal",
  "talisman"
]);

// ---------- 战斗结算（与 main.js 同一公式） ----------
function attackTarget(player, target, multiplier, kind) {
  const { damage } = computeDamage({
    target,
    hero: player.hero,
    player,
    multiplier,
    kind,
    fastForward: false,
    random: RNG
  });
  target.hp = Math.max(0, target.hp - damage);
  player.charge = clamp(player.charge + (target.boss ? 7 : 10), 0, 100);
  if (target.hp <= 0) target.alive = false; // 血量归零即死亡，与主循环 defeat 一致
  return target.hp <= 0;
}

// 玩家承伤（与 main.js playerDamage 一致：每帧只取最近一个攻击者判定命中，
// 普通怪 dt*0.32、Boss dt*0.6；毒 Boss 命中 100% 叠毒）。
function takeHits(player, entities, dt) {
  if (player.invulnerable > 0) return false;
  const attacker = entities
    .filter((entity) => entity.alive && distance(player, entity) < entity.radius + 70)
    .sort((a, b) => distance(player, a) - distance(player, b))[0];
  if (!attacker) return false;
  if (RNG() <= dt * (attacker.boss ? 0.6 : 0.32)) {
    const amount = computeIncomingDamage({
      attack: attacker.attack,
      attackerLevel: attacker.level,
      defense: playerDefense(player)
    });
    player.hp = Math.max(0, player.hp - amount);
    if (attacker.boss && attacker.poisonStacks) player.poison = clamp(player.poison + 1, 0, 5);
    return player.hp <= 0;
  }
  return false;
}

// 毒层持续伤害：每 1.2 秒 poison*4。
function tickPoison(player, dt) {
  if (player.poison <= 0) return false;
  player.poisonTimer = (player.poisonTimer || 0) - dt;
  if (player.poisonTimer <= 0) {
    player.poisonTimer = 1.2;
    player.hp = Math.max(0, player.hp - player.poison * 4);
    if (player.hp <= 0) return true;
  }
  return false;
}

// 使用药水：生命低于 45% 且背包有药水。
function maybeUsePotion(player) {
  if (player.potion <= 0 || player.hp >= maxHp(player) * 0.45) return;
  player.potion -= 1;
  player.potionUsed += 1;
  player.hp = clamp(player.hp + Math.round(maxHp(player) * 0.32), 0, maxHp(player));
}

// 死亡：回营地 55% 生命 + 3 秒无敌，关卡进度保留。
function handleDeath(player, map, stats) {
  player.deaths += 1;
  stats.deaths += 1;
  player.hp = Math.round(maxHp(player) * 0.55);
  player.resource = player.hero.resource * 0.45;
  player.invulnerable = 3;
  player.poison = 0;
  player.poisonTimer = 0;
  player.x = map.townRect.x + map.townRect.w / 2;
  player.y = map.townRect.y + map.townRect.h / 2;
}

// 掉落结算：与 main.js defeat → spawnDrop → collectDrops 的收益一致。
function handleDrops(player, source, map, stats) {
  const rolls = rollDropCount(source, RNG);
  for (let roll = 0; roll < rolls; roll += 1) {
    const item = rollDropItem({ source, mapDrops: map.drops, commonDrops: COMMON_DROPS, random: RNG, now: Date.now(), roll });
    if (item.kind === "gold") {
      player.gold += item.amount || 0;
    } else if (item.kind === "health_potion") {
      player.potion += 1;
    } else if (item.kind === "resource_potion") {
      player.resource = clamp(player.resource + Math.round(player.hero.resource * 0.35), 0, player.hero.resource);
    } else if (item.kind === "marks") {
      player.marks += 3;
    } else if (WEARABLE_SLOTS.has(item.slot)) {
      // 装备进背包 → 穿戴策略：有效战力更高才换装；背包满时丢弃最差装备
      // （真实玩家自动整理，避免旧强化装备占满背包导致后续掉落全部丢失）。
      if (player.inventory.length >= 12) {
        const weakest = player.inventory.reduce((worst, entry) => (effectiveItemPower(entry) < effectiveItemPower(worst) ? entry : worst));
        player.inventory = player.inventory.filter((entry) => entry.id !== weakest.id);
      }
      player.inventory.push(item);
      stats.itemsPicked += 1;
      tryEquip(player, item.slot, stats);
    }
  }
}

// 穿戴策略：新装备有效战力高于当前槽位时换装（武器/其他部位都按有效战力比较）。
function tryEquip(player, slotKey, stats) {
  const candidate = player.inventory.find((entry) => entry.slot === slotKey);
  if (!candidate) return;
  const current = player.equipment[slotKey];
  if (!current || effectiveItemPower(candidate) > effectiveItemPower(current)) {
    player.equipment[slotKey] = candidate;
    player.inventory = player.inventory.filter((entry) => entry.id !== candidate.id);
    if (current) player.inventory.push(current);
    stats.itemsEquipped += 1;
  }
}

// 强化策略：每关通关后用金币强化武器（+1~+5 必成优先，+6~+8 用 70% 概率，失败不降级）。
function maybeEnhance(player, stats) {
  const weapon = player.equipment.weapon;
  if (!weapon) return;
  const current = weapon.enhance || 0;
  if (current >= 15) return;
  const target = current + 1;
  const tier =
    target <= 5
      ? { rate: 1.0, cost: 70 * Math.pow(1.5, target) }
      : target <= 8
        ? { rate: 0.7, cost: 70 * Math.pow(1.5, target) }
        : { rate: 0.4, cost: 70 * Math.pow(1.5, target) };
  if (player.gold < tier.cost) return;
  player.gold -= Math.round(tier.cost);
  if (RNG() < tier.rate) {
    weapon.enhance = target;
    stats.enhanceCount += 1;
  }
  // 失败不降级不销毁（祝福值机制对 +6 以上影响后续尝试，此处简化为直接重试成本）
}

// ---------- 单关模拟 ----------
let RNG = mulberry32(1);

function simulateMap(player, map, rule, stats, logLine) {
  const hero = player.hero;
  // 生成实体：普通怪（spawn 点）+ 首领。
  const entities = map.monsterSpawns.map((spawn, index) => {
    const type = map.monsterTypes[spawn[2]];
    const level = clamp(map.levelMin + spawn[2] * 2 + (index % 3), map.levelMin, map.levelMax);
    return {
      id: `mob-${index}`,
      name: type.name,
      level,
      x: spawn[0],
      y: spawn[1],
      spawnX: spawn[0],
      spawnY: spawn[1],
      maxHp: type.hp,
      hp: type.hp,
      attack: type.attack,
      defense: type.defense,
      radius: type.radius,
      alive: true,
      boss: false,
      aggro: false,
      wander: RNG() * 6,
      gold: type.gold
    };
  });
  const bossBase = map.boss;
  const boss = {
    id: bossBase.id,
    name: bossBase.name,
    level: map.levelMax + 2,
    x: bossBase.x,
    y: bossBase.y,
    maxHp: bossBase.hp,
    hp: bossBase.hp,
    attack: bossBase.attack,
    defense: bossBase.defense,
    radius: bossBase.radius,
    gold: bossBase.gold,
    alive: true,
    boss: true,
    phase: 1,
    specialKind: bossBase.specialKind,
    poisonStacks: bossBase.poisonStacks || false,
    specialTimer: bossBase.specialInterval
  };
  entities.push(boss);

  // 玩家从安全营地出发：进新图前先在营地站桩回满血（真实玩家行为）。
  player.x = map.townRect.x + map.townRect.w / 2;
  player.y = map.townRect.y + map.townRect.h / 2;
  player.hp = maxHp(player);
  player.invulnerable = 3;
  player.poison = 0;
  player.poisonTimer = 0;
  player.attackTimer = 0;
  player.cooldowns = [0, 0, 0, 0];

  const startHp = player.hp;
  const stats0 = { ...stats, deaths: 0 };
  let kills = 0;
  let elapsed = 0;
  const DT = 1 / 30; // 30 帧步进，约 33ms
  const MAX_TIME = 600; // 单关上限 10 分钟，防死循环

  // 最近存活普通怪
  const nearestMob = () =>
    entities.filter((entity) => entity.alive && !entity.boss).sort((a, b) => distance(player, a) - distance(player, b))[0] || null;

  // ---------- 阶段一：清怪（need 只） ----------
  let clearTime = 0;
  const clearStart = elapsed;
  while (kills < rule.kills && elapsed < MAX_TIME) {
    const target = nearestMob();
    if (!target) break;
    // 移动：超出攻击距离则靠近（玩家速度 hero.speed）。
    if (distance(player, target) > hero.range) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      player.x = clamp(player.x + (dx / length) * hero.speed * DT, 55, map.width - 55);
      player.y = clamp(player.y + (dy / length) * hero.speed * DT, 55, map.height - 55);
      // 目标怪进入 190 距离后追击玩家（132 速度，与 updateMonsterAI 一致）。
      if (!target.aggro && distance(player, target) < 190) target.aggro = true;
      if (target.aggro) {
        // 追击速度 132，距玩家 46 处停住（与 updateMonsterAI 一致）。
        const stopAt = Math.max(0, distance(player, target) - 46);
        if (stopAt > 4) {
          const tdx = player.x - target.x;
          const tdy = player.y - target.y;
          const tlen = Math.hypot(tdx, tdy) || 1;
          target.x = clamp(target.x + (tdx / tlen) * 132 * DT, 55, map.width - 55);
          target.y = clamp(target.y + (tdy / tlen) * 132 * DT, 55, map.height - 55);
        }
      }
    } else {
      // 攻击循环：一刀时刻 → 技能 → 普攻。
      if (player.charge >= 100) {
        const mult = player.classId === "warrior" ? 3.2 : player.classId === "mage" ? 2.7 : 2.35;
        player.charge = 0;
        attackTarget(player, target, mult, "爆发");
      } else if (!trySkills(player, target, entities)) {
        if (player.attackTimer <= 0) {
          player.attackTimer = hero.cooldown;
          player.resource = clamp(
            player.resource + (player.classId === "warrior" ? 6 : player.classId === "taoist" ? 4 : -8),
            0,
            hero.resource
          );
          attackTarget(player, target, 1, "普通");
        }
      }
      if (!target.alive) {
        // 击杀结算：金币与进度。
        player.gold += target.gold;
        player.totalKills += 1;
        handleDrops(player, target, map, stats);
        kills += 1;
      }
    }
    // 玩家承伤 / 毒 / 药水 / 死亡。
    const died = takeHits(player, entities, DT) || tickPoison(player, DT);
    if (died) {
      handleDeath(player, map, stats0);
      continue;
    }
    maybeUsePotion(player);
    elapsed += DT;
    player.invulnerable = Math.max(0, player.invulnerable - DT);
    player.attackTimer = Math.max(0, player.attackTimer - DT);
    player.cooldowns = player.cooldowns.map((cd) => Math.max(0, cd - DT));
    player.resource = clamp(player.resource + hero.resource * 0.008 * DT, 0, hero.resource);
  }
  clearTime = elapsed - clearStart;

  // ---------- 阶段二：Boss 战 ----------
  let bossTime = 0;
  const bossStart = elapsed;
  let hazardTimer = bossBase.specialInterval;
  while (boss.alive && elapsed < MAX_TIME) {
    // 阶段转换：按血量比例（与 updateBoss 一致）。
    const hpRatio = boss.hp / boss.maxHp;
    const newPhase =
      bossBase.phases >= 3
        ? hpRatio > bossBase.phase1Trigger
          ? 1
          : hpRatio > bossBase.phase2Trigger
            ? 2
            : 3
        : hpRatio > bossBase.phase1Trigger
          ? 1
          : 2;
    if (newPhase !== boss.phase) boss.phase = newPhase;
    // 危险区：阶段 2 起按间隔生成；玩家走位躲避（近战 50% / 远程 75% 躲避率）。
    if (boss.phase >= 2) {
      hazardTimer -= DT;
      if (hazardTimer <= 0) {
        hazardTimer = Math.max(2, bossBase.specialInterval - boss.phase * 0.8);
        const dodge = hero.range > 100 ? 0.75 : 0.5;
        if (RNG() > dodge) {
          const amount = computeIncomingDamage({
            attack: Math.round(boss.attack * 1.4),
            attackerLevel: boss.level,
            defense: playerDefense(player)
          });
          player.hp = Math.max(0, player.hp - amount);
        }
      }
    }
    // 移动与攻击。
    if (distance(player, boss) > hero.range) {
      const dx = boss.x - player.x;
      const dy = boss.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      player.x = clamp(player.x + (dx / length) * hero.speed * DT, 55, map.width - 55);
      player.y = clamp(player.y + (dy / length) * hero.speed * DT, 55, map.height - 55);
    } else if (player.charge >= 100) {
      const mult = player.classId === "warrior" ? 3.2 : player.classId === "mage" ? 2.7 : 2.35;
      player.charge = 0;
      attackTarget(player, boss, mult, "爆发");
    } else if (!trySkills(player, boss, entities)) {
      if (player.attackTimer <= 0) {
        player.attackTimer = hero.cooldown;
        player.resource = clamp(
          player.resource + (player.classId === "warrior" ? 6 : player.classId === "taoist" ? 4 : -8),
          0,
          hero.resource
        );
        attackTarget(player, boss, 1, "普通");
      }
    }
    if (!boss.alive) {
      player.gold += boss.gold;
      player.totalKills += 1;
      handleDrops(player, boss, map, stats);
    }
    const died = takeHits(player, entities, DT) || tickPoison(player, DT);
    if (died) {
      handleDeath(player, map, stats0);
      continue;
    }
    maybeUsePotion(player);
    elapsed += DT;
    player.invulnerable = Math.max(0, player.invulnerable - DT);
    player.attackTimer = Math.max(0, player.attackTimer - DT);
    player.cooldowns = player.cooldowns.map((cd) => Math.max(0, cd - DT));
    player.resource = clamp(player.resource + hero.resource * 0.008 * DT, 0, hero.resource);
  }
  bossTime = elapsed - bossStart;
  stats.deaths += stats0.deaths;

  // ---------- 通关结算 ----------
  // 超时未清完怪或 Boss 未击杀 → 记录为卡关（模拟器单关上限 10 分钟）。
  if (kills < rule.kills || boss.alive) stats.stuckMaps += 1;
  player.completedMaps += 1;
  player.gold += 60;
  player.marks += 8;
  // 升级：等级/经验由通关数驱动（与 syncCampaignGrowth 一致）。
  const growth = campaignGrowth(player.completedMaps);
  const previousLevel = player.level;
  player.level = growth.level;
  player.exp = growth.exp;
  player.nextExp = growth.nextExp;
  if (growth.level > previousLevel) {
    player.skillPoints = (player.skillPoints || 0) + 1;
    player.hp = maxHp(player);
    player.resource = hero.resource;
  }
  // 技能点投放：优先主爆发技能满 10 级，再投第一个技能（贴近真实玩家点法）。
  const burstIndex = hero.skills.findIndex((skill) => skill.kind === "爆发");
  const primary = burstIndex >= 0 ? burstIndex : 0;
  const secondary = primary === 0 ? Math.min(1, hero.skills.length - 1) : 0;
  while (!NO_SKILL && player.skillPoints > 0) {
    const idx = player.skillLevels[primary] < 10 ? primary : secondary;
    if (player.skillLevels[idx] >= 10) break;
    player.skillLevels[idx] += 1;
    player.skillPoints -= 1;
  }
  // 通关后强化武器。
  if (!NO_ENHANCE) maybeEnhance(player, stats);

  const weapon = player.equipment.weapon;
  const weaponPower = weapon ? effectiveItemPower(weapon) : 0;
  logLine(
    `${String(player.completedMaps).padStart(3, "0")} ${map.id} Lv.${player.level} 死亡+${stats0.deaths} ` +
      `清${clearTime.toFixed(0)}s Boss${bossTime.toFixed(0)}s 总${elapsed.toFixed(0)}s ` +
      `药${player.potionUsed} 装${stats.itemsEquipped} 强+${weapon?.enhance || 0} 武${weaponPower} 金${player.gold}`
  );
  return {
    mapId: map.id,
    index: player.completedMaps - 1,
    level: player.level,
    clearTime,
    bossTime,
    totalTime: elapsed,
    deaths: stats0.deaths,
    potionUsed: player.potionUsed,
    weaponPower,
    gold: Math.round(player.gold)
  };
}

// 技能循环：返回 true 表示本帧放了一个技能（优先单目标高倍率，范围技能在多怪/Boss 时使用）。
function trySkills(player, target, entities) {
  const hero = player.hero;
  for (let index = 0; index < hero.skills.length; index += 1) {
    const skill = hero.skills[index];
    if (player.cooldowns[index] > 0 || player.resource < skill.cost) continue;
    if (skill.kind === "治疗") {
      // 道士治疗：生命低于 60% 时使用。
      if (player.hp < maxHp(player) * 0.6 && distance(player, target) <= Math.max(skill.range, 120)) {
        player.resource -= skill.cost;
        player.cooldowns[index] = skill.cd;
        player.hp = clamp(player.hp + Math.round(hero.hp * 0.28), 0, maxHp(player));
        player.charge = clamp(player.charge + 18, 0, 100);
        return true;
      }
      continue;
    }
    if (skill.kind === "召唤") continue;
    if (skill.kind === "范围") {
      const mobsNear = entities.filter((entity) => entity.alive && !entity.boss && distance(player, entity) < skill.range);
      if (target.boss || mobsNear.length >= 2) {
        if (distance(player, target) > skill.range && !target.boss) continue;
        player.resource -= skill.cost;
        player.cooldowns[index] = skill.cd;
        const multiplier = skill.damage * (1 + 0.06 * (player.skillLevels[index] || 0));
        const targets = target.boss ? [target] : mobsNear.slice(0, 5);
        targets.forEach((entity) => attackTarget(player, entity, multiplier, "范围"));
        return true;
      }
      continue;
    }
    if (distance(player, target) <= skill.range) {
      player.resource -= skill.cost;
      player.cooldowns[index] = skill.cd;
      const multiplier = skill.damage * (1 + 0.06 * (player.skillLevels[index] || 0));
      attackTarget(player, target, multiplier, skill.kind);
      return true;
    }
  }
  return false;
}

// ---------- 入口 ----------
const args = process.argv.slice(2);
const classArg = args.find((arg) => arg.startsWith("--classes="))?.split("=")[1] || "warrior,mage,taoist";
const classes = classArg
  .split(",")
  .map((name) => name.trim())
  .filter((name) => CLASSES[name]);
// 敏感性验证开关：--no-skill 关闭技能点投放，--no-enhance 关闭装备强化。
const NO_SKILL = args.includes("--no-skill");
const NO_ENHANCE = args.includes("--no-enhance");

function runClass(classId) {
  const seed = 20261022 + (classId === "warrior" ? 1 : classId === "mage" ? 2 : 3);
  RNG = mulberry32(seed);
  const player = createPlayer(classId);
  const stats = { deaths: 0, itemsPicked: 0, itemsEquipped: 0, enhanceCount: 0, stuckMaps: 0 };
  const rows = [];
  const details = [];
  console.log(`\n===== ${CLASSES[classId].name}（${classId}）真实速度百图模拟 seed=${seed} =====`);
  for (let index = 0; index < MAP_ORDER.length; index += 1) {
    const mapId = MAP_ORDER[index];
    const map = MAPS[mapId];
    const rule = MAP_CLEAR_RULES[mapId];
    const detail = simulateMap(player, map, rule, stats, (line) => {
      rows.push(line);
    });
    details.push(detail);
  }
  // 汇总：每 10 关死亡/耗时聚合。
  console.log("--- 逐关明细 ---");
  rows.forEach((line) => console.log(line));
  console.log("--- 汇总 ---");
  console.log(
    `${CLASSES[classId].name}: 总死亡 ${stats.deaths}，卡关 ${stats.stuckMaps}，` +
      `拾取 ${stats.itemsPicked} 件装备、换装 ${stats.itemsEquipped} 次、强化成功 ${stats.enhanceCount} 次，` +
      `用药 ${player.potionUsed} 瓶，最终 Lv.${player.level} 金币 ${Math.round(player.gold)}`
  );
  return { classId, stats, player, rows, details };
}

function main() {
  const results = classes.map(runClass);
  // 每 10 关死亡分布（从 details 统计）。
  console.log("\n===== 每 10 关死亡次数分布（死亡 > 3 次/关 为过难信号） =====");
  for (const { classId, details } of results) {
    const buckets = Array.from({ length: 10 }, () => 0);
    const worst = [];
    details.forEach((detail) => {
      buckets[Math.floor(detail.index / 10)] += detail.deaths;
      if (detail.deaths > 3) worst.push(`${MAP_ORDER[detail.index]}(${detail.deaths})`);
    });
    console.log(
      `${CLASSES[classId].name}: [${buckets.map((b) => String(b).padStart(2, "0")).join(" ")}] ` +
        (worst.length ? `过难关：${worst.join(" ")}` : "无单关死亡>3")
    );
  }
  // 阶段汇总：按升级曲线分段 A(1-10) B(11-30) C(31-60) D(61-100)。
  console.log("\n===== 阶段汇总（死亡 / 平均清怪 / 平均Boss / 平均总耗时 / 武器战力末值） =====");
  const segments = [
    { label: "A 1-10关(Lv.1-11)", from: 0, to: 10 },
    { label: "B 11-30关(Lv.11-21)", from: 10, to: 30 },
    { label: "C 31-60关(Lv.21-31)", from: 30, to: 60 },
    { label: "D 61-100关(Lv.31-41)", from: 60, to: 100 }
  ];
  for (const { classId, details } of results) {
    const line = segments
      .map((seg) => {
        const part = details.filter((d) => d.index >= seg.from && d.index < seg.to);
        const deaths = part.reduce((sum, d) => sum + d.deaths, 0);
        const avg = (key) => (part.length ? (part.reduce((sum, d) => sum + d[key], 0) / part.length).toFixed(0) : 0);
        const last = part[part.length - 1];
        return `${seg.label} 死${deaths} 清${avg("clearTime")}s/Boss${avg("bossTime")}s/总${avg("totalTime")}s 武${last?.weaponPower || 0}`;
      })
      .join(" | ");
    console.log(`${CLASSES[classId].name}: ${line}`);
  }
  // 总耗时与 CSV 导出。
  const csvPath = "tests/balance-out.csv";
  const lines = [
    "classId,index,mapId,level,clearTime,bossTime,totalTime,deaths,potionUsed,weaponPower,gold",
    ...results.flatMap(({ classId, details }) =>
      details.map((d) =>
        [
          classId,
          d.index,
          d.mapId,
          d.level,
          d.clearTime.toFixed(0),
          d.bossTime.toFixed(0),
          d.totalTime.toFixed(0),
          d.deaths,
          d.potionUsed,
          d.weaponPower,
          d.gold
        ].join(",")
      )
    )
  ];
  writeFileSync(csvPath, lines.join("\n"), "utf8");
  console.log(`\n逐关明细已导出：${csvPath}`);
  for (const { classId, details } of results) {
    const total = details.reduce((sum, d) => sum + d.totalTime, 0);
    console.log(`${CLASSES[classId].name} 百图游戏内总耗时：${Math.round(total / 60)} 分钟（${Math.round(total)}s）`);
  }
}

main();
