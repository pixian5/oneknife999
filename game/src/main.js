import {
  CLASSES,
  COMMON_DROPS,
  TEST_MODE,
  FAST_FORWARD,
  STORAGE_KEY,
  EQUIPMENT_SLOT_KEYS,
  enhanceQuote,
  effectiveItemPower,
  ENHANCE_RULES,
  SKILL_UPGRADE,
  PK_RULES,
  QUEST_REWARD,
  BASIC_MATERIAL
} from "./config.js";
import { MAPS, MAP_ORDER, MAP_CLEAR_RULES, campaignGrowth, mapLayoutSignature, pathTurnCount } from "./maps.js";
import { pathLength } from "./geometry.js";
import { $, clamp, distance, rand } from "./util.js";
import {
  state,
  setState,
  createState,
  keys,
  joystick,
  pointer,
  moveTarget,
  setMoveTarget,
  activeMap,
  activeHero,
  mapProgress,
  isForwardExit,
  primaryExit,
  playerMaxHp,
  playerDefense,
  nearWaterWell,
  nearRestPoint,
  nearTown,
  isRedName,
  fx
} from "./runtime.js";
import { COMBO_RULES, advanceCombo, registerComboKill } from "./feedback.js";
import {
  canvas,
  canvasPoint,
  resizeCanvas,
  getViewScale,
  getCamera,
  showToast,
  log,
  textAt,
  spark,
  renderAll,
  objectiveView,
  renderTarget,
  renderPlayer,
  renderInventory,
  renderTravelConfirm
} from "./render.js";
import { persistGame, readSavedGame, clearStorage, CURRENT_SAVE_VERSION } from "./persist.js";
import {
  computeDamage,
  computeKillReward,
  computeIncomingDamage,
  applyExperience,
  advanceMonsterAttack,
  MONSTER_ATTACK_RULES
} from "./combat.js";
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
} from "./skills.js";
import {
  rollDropItem,
  rollDropCount,
  computePickup,
  computeSiteEffect,
  stackMaterial,
  salvageReward,
  normalizeInventory
} from "./drops.js";
import { buyShopItem, reforgeQuote, reforgeAffix } from "./shop.js";
import { sfx, unlockAudio } from "./audio.js";
import { setupInput } from "./input.js";
import { keyLabel } from "./keybinds.js";

// 《一刀999》入口与主逻辑：地图流程、战斗、掉落、输入、主循环与 E2E 接口。

// 主循环计时与出口确认的模块内状态
let lastTime = 0;
let pendingTravel = null;
// 0.3.4 围攻上限：同一时刻只允许 1 只怪蓄力。旧实现每帧只判定「最近的一只」敌人，
// 因此被 6 只怪围住时承伤并不会翻 6 倍；固定前摇节奏必须显式保留这个特性，否则百图会陷入死亡循环。
const MAX_WINDUP_ATTACKERS = 1;

export function createEntities(map) {
  const result = [];
  map.monsterSpawns.forEach((spawn, index) => {
    const type = map.monsterTypes[spawn[2]];
    const level = clamp(map.levelMin + spawn[2] * 2 + (index % 3), map.levelMin, map.levelMax);
    result.push({
      id: `mob-${index}`,
      ...type,
      level,
      x: spawn[0],
      y: spawn[1],
      maxHp: type.hp,
      respawn: 0,
      alive: true,
      hitFlash: 0,
      wander: Math.random() * 6,
      poisonTimer: 0,
      morph: spawn[2] % 4,
      spawnX: spawn[0],
      spawnY: spawn[1],
      patrolRadius: 55 + Math.random() * 50,
      aggro: false,
      friendly: false,
      // 0.3.4 攻击前摇：初始冷却按一个完整周期随机错开，避免玩家一进圈就被整群怪同时抬手。
      attackCooldown: rand(1.2, 2.9),
      windup: 0,
      windupTotal: MONSTER_ATTACK_RULES.normal.windup,
      armorBreakTimer: 0
    });
  });
  const b = map.boss;
  result.push({
    id: b.id,
    name: b.name,
    level: map.levelMax + 2,
    color: b.color,
    hp: b.hp,
    maxHp: b.hp,
    attack: b.attack,
    defense: b.defense,
    exp: b.exp,
    gold: b.gold,
    radius: b.radius,
    x: b.x,
    y: b.y,
    alive: true,
    boss: true,
    friendly: false,
    hitFlash: 0,
    phase: 1,
    respawn: 0,
    phaseTimer: 0,
    attackCooldown: 0.6,
    windup: 0,
    windupTotal: MONSTER_ATTACK_RULES.boss.windup,
    armorBreakTimer: 0,
    specialTimer: FAST_FORWARD ? 0.25 : b.specialInterval,
    summonTimer: b.summonInterval || 0
  });
  // PK 单机演示（docs/05）：危险/绝地地图固定刷 1 名白名流浪武者；
  // 20 级前不能主动攻击，被攻击后会反击，击杀会累积罪恶值。
  if (map.danger === "danger" || map.danger === "desolate") {
    const worst = [...map.monsterTypes].sort((a, b) => b.attack - a.attack)[0];
    const tough = [...map.monsterTypes].sort((a, b) => b.hp - a.hp)[0];
    const spot = {
      x: clamp((map.townRect.x + b.x) / 2 + 120, 400, 2000),
      y: clamp((map.townRect.y + b.y) / 2, 200, 1300)
    };
    result.push({
      id: "npc-wanderer",
      npc: true,
      name: "流浪武者",
      level: map.levelMax,
      color: "#d8e8dc",
      hp: Math.round(tough.hp * 1.6),
      maxHp: Math.round(tough.hp * 1.6),
      attack: Math.round(worst.attack * 0.85),
      defense: tough.defense,
      exp: 0,
      gold: Math.round(worst.gold * 1.5),
      radius: 18,
      x: spot.x,
      y: spot.y,
      spawnX: spot.x,
      spawnY: spot.y,
      patrolRadius: 70,
      alive: true,
      hitFlash: 0,
      wander: Math.random() * 6,
      hostile: false,
      aggro: false,
      friendly: false,
      attackCooldown: 0.8,
      windup: 0,
      windupTotal: MONSTER_ATTACK_RULES.normal.windup,
      armorBreakTimer: 0,
      respawn: 0
    });
  }
  return result;
}

export function loadMap(mapId, spawnX, spawnY, silent) {
  const map = MAPS[mapId];
  const fromMap = state.currentMapId;
  state.currentMapId = mapId;
  state.player.x = spawnX;
  state.player.y = spawnY;
  // Each map entry starts in a protected buffer so a death never creates an unrecoverable low-health loop.
  state.player.hp = playerMaxHp();
  state.player.resource = activeHero().resource;
  state.player.targetId = null;
  setMoveTarget(null);
  state.player.invulnerable = 3;
  state.player.poison = 0;
  // 换图 / 复活时清空出手闸门，避免带着上一场的节奏进入新场景。
  state.player.attackGate = 0;
  state.entities = createEntities(map);
  state.drops = [];
  state.particles = [];
  state.texts = [];
  state.hazards = [];
  state.hazardsSpawned = 0;
  // 生息法阵属于当前场景的瞬态区域：换图 / 复活时清空，避免在营地继续回血。
  state.healZones = [];
  // 杂货商面板只在城镇内有效，换图 / 复活时收起，避免跨场景残留。
  state.shopOpen = false;
  state.hoveredEntityId = null;
  // 换图 / 死亡复活时清空瞬时打击反馈，避免连击数与震屏跨场景残留。
  fx.combo = 0;
  fx.comboTimer = 0;
  fx.shake = 0;
  fx.levelUp = 0;
  state.quest = mapProgress(mapId);
  state.player.visitedMaps[mapId] = true;
  if (!silent) {
    log(`进入 <b>${map.name} · ${map.subtitle}</b>：推荐等级 Lv.${map.levelMin}-${map.levelMax}，${map.dangerLabel}。`, "loot");
    log(`<b>${map.story.chapterTitle} · ${map.story.beatTitle}</b>：${map.story.summary}`, "loot");
    log(`${map.story.speaker}：${map.story.dialogue}`);
    showToast(`${map.name} · ${map.subtitle}（Lv.${map.levelMin}-${map.levelMax}）`);
    if (map.danger === "danger" || map.danger === "desolate")
      log(`本区为<b style="color:#ee9b91">危险区</b>：实际游戏会按规则结算 PK 爆装，本原型仅作地图切换演示。`, "warn");
    const progress = mapProgress(mapId);
    if (!progress.completed) log(`关卡目标：击败 <b>${progress.need} 只普通怪物</b>并击破<b>${MAP_CLEAR_RULES[mapId].boss}</b>。`, "loot");
  }
  renderAll();
}

export function chooseClass(classId) {
  setState(createState(classId));
  loadMap("ash_outskirts", 480, 780, true);
  $("classModal").classList.add("hidden");
  log(`你选择了 <b>${CLASSES[classId].name}</b>，矿道深处传来石碑碎裂声。`);
  log("百图征途开启：每关都要完成<b>普通怪清剿</b>并击破<b>区域首领</b>。", "loot");
  log("前 10 关每图提升一级，后期逐步变为每 2、3、4 图提升一级。", "loot");
  showToast("出城后会自动记录目标，点击怪物即可锁定");
  renderAll();
}

export function findTarget() {
  if (state.player.targetId) {
    const current = state.entities.find((entity) => entity.id === state.player.targetId && entity.alive);
    if (current && distance(state.player, current) < 330) return current;
  }
  // 自动索敌不锁定流浪武者：PK 必须显式点击目标（docs/05 主动攻击规则）。
  return (
    state.entities
      .filter((entity) => entity.alive && !entity.npc && !entity.friendly && distance(state.player, entity) < 310)
      .sort((a, b) => distance(state.player, a) - distance(state.player, b))[0] || null
  );
}

export function selectTarget(entity) {
  // 召唤物是友军：点击不锁定，避免玩家普攻指向自己的骨卫。
  if (entity?.friendly) return;
  // 20 级前不能主动攻击玩家（docs/05 PK 保护）。
  if (entity?.npc && state.player.level < PK_RULES.minLevelToAttack) {
    showToast(`Lv.${PK_RULES.minLevelToAttack} 前不能主动攻击其他玩家（PK 保护）`);
    return;
  }
  state.player.targetId = entity ? entity.id : null;
  setMoveTarget(null);
  if (entity) {
    log(`锁定目标：<b>${entity.name}</b>${entity.boss ? ` · 阶段 ${entity.phase}/${activeMap().boss.phases}` : ""}`);
    showToast(`${entity.name} 已锁定，按 ${keyLabel("attack")} 或点击普攻攻击`);
  }
  renderTarget();
}

// 伤害结算：纯计算交给 combat.js，这里只负责写回实体状态与打击反馈。
export function resolveDamage(target, multiplier, skillName, kind) {
  const hero = activeHero();
  const { damage, critical, chargeGain } = computeDamage({
    target,
    hero,
    player: state.player,
    multiplier,
    kind,
    fastForward: FAST_FORWARD
  });
  if (target.npc) target.hostile = true;
  sfx.hit();
  target.hp = Math.max(0, target.hp - damage);
  target.hitFlash = 0.12;
  state.player.charge = clamp(state.player.charge + chargeGain, 0, 100);
  // 0.3.3 打击感：满破势爆发（含一刀时刻）触发短促震屏，让高倍率结算有重量感。
  if (critical) {
    fx.shake = 0.22;
    fx.shakePower = 5;
  }
  spark(target.x, target.y, hero.color, kind === "范围" ? 14 : 7);
  textAt(`${damage}`, target.x, target.y - target.radius - 12, kind === "爆发" ? "#e7b36b" : "#eff4ef", kind === "爆发" ? 18 : 13);
  if (skillName) log(`${skillName} 命中 <b>${target.name}</b>，造成 ${damage} 点伤害。`);
  if (target.hp <= 0) defeat(target);
  return damage;
}

export function nearestTargets(range, limit = 1) {
  return state.entities
    .filter((entity) => entity.alive && !entity.friendly && distance(state.player, entity) <= range)
    .sort((a, b) => distance(state.player, a) - distance(state.player, b))
    .slice(0, limit);
}

export function normalAttack() {
  if (!state) return;
  const hero = activeHero();
  if (state.player.attackTimer > 0) return;
  const target = findTarget();
  if (!target) {
    showToast("附近没有可攻击目标，点击地图移动或按 Space 搜索");
    return;
  }
  if (distance(state.player, target) > hero.range) {
    state.player.targetId = target.id;
    setMoveTarget({ x: target.x, y: target.y });
    showToast(`正在接近 ${target.name}`);
    return;
  }
  const normalAttackCost = state.classId === "mage" ? 8 : 0;
  if (normalAttackCost > 0 && state.player.resource < normalAttackCost) {
    showToast(`${hero.resourceName}不足，普攻需要 ${normalAttackCost} 点${hero.resourceName}`);
    return;
  }
  state.player.attackTimer = hero.cooldown;
  state.player.resource = clamp(
    state.player.resource + (state.classId === "warrior" ? 6 : state.classId === "taoist" ? 4 : -normalAttackCost),
    0,
    hero.resource
  );
  resolveDamage(target, 1, "普攻", "普通");
}

export function castSkill(index) {
  if (!state) return;
  const hero = activeHero();
  const skill = hero.skills[index];
  if (!skill || state.player.cooldowns[index] > 0) return;
  if (state.player.resource < skill.cost) {
    showToast(`${hero.resourceName}不足，击杀怪物或使用药水恢复`);
    return;
  }
  const target = findTarget();
  // 生息法阵（0.3.4）：在脚下展开 4 秒持续回复区，每秒回 8% 最大生命，离开立即失效。
  if (skill.kind === "治疗") {
    state.player.resource -= skill.cost;
    state.player.cooldowns[index] = skill.cd;
    state.healZones = [
      {
        x: state.player.x,
        y: state.player.y,
        radius: skill.area || SKILL_RULES.healZone.radius,
        life: SKILL_RULES.healZone.duration,
        tick: SKILL_RULES.healZone.tick
      }
    ];
    state.player.charge = clamp(state.player.charge + 18, 0, 100);
    log(
      `生息法阵展开：${SKILL_RULES.healZone.duration} 秒内站在阵中每秒恢复 ${Math.round(SKILL_RULES.healZone.perSecond * 100)}% 生命，离开即失效。`,
      "loot"
    );
    showToast("生息法阵展开：留在阵中持续回复，离开失效");
    return;
  }
  if (!target) {
    showToast("先锁定一个目标");
    return;
  }
  if (distance(state.player, target) > skill.range) {
    setMoveTarget({ x: target.x, y: target.y });
    showToast(`正在进入 ${skill.name} 的施法距离`);
    return;
  }
  state.player.resource -= skill.cost;
  state.player.cooldowns[index] = skill.cd;
  // 召唤骨卫（0.3.4）：生成 12 秒实体，自动跟随并索敌，不再是一次性伤害。
  if (skill.kind === "召唤") {
    const guard = createBoneGuard({
      player: state.player,
      hero,
      level: state.player.level,
      id: `bone-guard-${Date.now()}`
    });
    state.entities.push(guard);
    state.player.charge = clamp(state.player.charge + 12, 0, 100);
    log(
      `骨卫在场景中现身：${SKILL_RULES.summon.duration} 秒内跟随你并自动索敌，按你 ${Math.round(SKILL_RULES.summon.attackRatio * 100)}% 的普攻伤害出手。`,
      "loot"
    );
    showToast(`骨卫已现身：${SKILL_RULES.summon.duration} 秒内自动索敌`);
    renderAll();
    return;
  }
  // 技能升级（docs/02 原型简化）：每级 +6% 技能倍率。
  const skillLevel = state.player.skillLevels?.[index] || 0;
  const multiplier = skill.damage * (1 + SKILL_UPGRADE.multiplierPerLevel * skillLevel);
  // 震地冲（0.3.4）：向目标突进 140px、击退目标并获得 0.2 秒无敌，替代原地结算。
  if (skill.kind === "冲锋") {
    const point = resolveChargePoint({ from: state.player, to: target, stopGap: (target.radius || 0) + 16 });
    const map = activeMap();
    state.player.x = clamp(point.x, 55, map.width - 55);
    state.player.y = clamp(point.y, 55, map.height - 55);
    state.player.invulnerable = Math.max(state.player.invulnerable, SKILL_RULES.charge.invulnerable);
    resolveDamage(target, multiplier, skill.name, skill.kind);
    if (target.alive) {
      const knocked = resolveKnockback({
        origin: state.player,
        target,
        bounds: { minX: 55, maxX: map.width - 55, minY: 55, maxY: map.height - 55 }
      });
      target.x = knocked.x;
      target.y = knocked.y;
    }
    log(`震地冲：向前突进 ${Math.round(point.travel)} 像素并击退目标，获得 ${SKILL_RULES.charge.invulnerable.toFixed(1)} 秒无敌。`, "loot");
    showToast(`震地冲：突进 ${Math.round(point.travel)}px，击退目标`);
    return;
  }
  // 破甲斩（0.3.4）：命中后目标防御 -15%，持续 4 秒。
  if (skill.kind === "破甲") {
    resolveDamage(target, multiplier, skill.name, skill.kind);
    if (target.alive) {
      applyArmorBreak(target);
      log(
        `破甲：<b>${target.name}</b> 防御降低 ${Math.round(SKILL_RULES.armorBreak.defenseRatio * 100)}%，持续 ${SKILL_RULES.armorBreak.duration} 秒。`,
        "loot"
      );
      showToast(`破甲生效：${target.name} 防御 -${Math.round(SKILL_RULES.armorBreak.defenseRatio * 100)}%`);
    }
    return;
  }
  // 雷矛术（0.3.4）：沿锁定方向穿透，最多命中直线上的 3 个目标。
  if (skill.kind === "穿透") {
    const hits = pickPierceTargets({
      origin: state.player,
      aim: target,
      entities: state.entities,
      range: skill.range,
      maxTargets: SKILL_RULES.pierce.maxTargets
    });
    const list = hits.length ? hits : [target];
    list.forEach((entity) => resolveDamage(entity, multiplier, null, skill.kind));
    fx.pierce = { x1: state.player.x, y1: state.player.y, x2: target.x, y2: target.y, life: 0.18 };
    log(`<b>${skill.name}</b> 穿透命中 ${list.length} 个目标（最多 ${SKILL_RULES.pierce.maxTargets} 个）。`, "loot");
    if (list.length > 1) showToast(`${skill.name} 穿透 ${list.length} 个目标`);
    return;
  }
  if (skill.kind === "范围") {
    nearestTargets(skill.range, 5).forEach((entity) => resolveDamage(entity, multiplier, skill.name, skill.kind));
  } else resolveDamage(target, multiplier, skill.name, skill.kind);
}

export function oneMoment() {
  if (!state || state.player.charge < 100) {
    showToast("破势槽未满，先用职业行为积累一刀时刻");
    return;
  }
  const target = findTarget();
  if (!target || distance(state.player, target) > 330) {
    showToast("锁定一个目标再释放一刀时刻");
    return;
  }
  state.player.charge = 0;
  const firstDisplay = !state.player.oneMomentUsed;
  state.player.oneMomentUsed = true;
  const actual = resolveDamage(target, state.classId === "warrior" ? 3.2 : state.classId === "mage" ? 2.7 : 2.35, "一刀时刻", "爆发");
  if (firstDisplay) {
    textAt("999", target.x, target.y - target.radius - 42, "#e7b36b", 25);
    log("<b>一刀时刻</b>首次触发：剧情飘字显示 999，实际结算仍为服务器伤害。", "loot");
  } else log(`一刀时刻完成真实结算：${actual} 点伤害。`, "loot");
  showToast("一刀时刻：下一次核心爆发已命中");
}

// 当前关卡的等级上限：主线曲线等级 + 1（0.3.2 击杀升级）。
// 只允许在关内领先主线一级，避免刷怪无限升级；通关时 syncCampaignGrowth 不会把已获得的等级降回去。
// 原型最高 41 级（第 100 关通关），所以上限再夹到 41，防止终局刷到 42。
export function currentLevelCap() {
  const cleared = MAP_ORDER.filter((id) => state.mapProgress?.[id]?.completed).length;
  return Math.min(41, campaignGrowth(cleared).level + 1);
}

// 击杀获得经验并结算升级：升级时补满生命与职业资源、发放技能点并播放音效。
// 返回本次提升的等级数（0 表示未升级）。
function gainExperience(amount) {
  const result = applyExperience({
    level: state.player.level,
    exp: state.player.exp,
    nextExp: state.player.nextExp,
    expGain: amount,
    levelCap: currentLevelCap()
  });
  state.player.level = result.level;
  state.player.exp = result.exp;
  state.player.nextExp = result.nextExp;
  if (!result.levelsGained) return 0;
  state.player.skillPoints = (state.player.skillPoints || 0) + SKILL_UPGRADE.pointsPerLevel * result.levelsGained;
  state.player.hp = playerMaxHp();
  state.player.resource = activeHero().resource;
  sfx.levelup();
  // 0.3.3 升级反馈：金色粒子爆发 + 短暂震屏 + 世界内升级光环（render.js 读取 fx.levelUp）。
  fx.levelUp = 1.1;
  fx.shake = 0.2;
  fx.shakePower = 4;
  spark(state.player.x, state.player.y, "#e7b36b", 26);
  textAt("LEVEL UP", state.player.x, state.player.y - 58, "#e7b36b", 20);
  log(
    `<b>等级提升</b>：击杀经验达到 Lv.${state.player.level}，技能点 +${SKILL_UPGRADE.pointsPerLevel * result.levelsGained}（按 ${keyLabel("skillUpgrade")} 打开技能）。本关最高可到 Lv.${currentLevelCap()}。`,
    "loot"
  );
  showToast(`升级成功：Lv.${state.player.level}（技能点 +${result.levelsGained}，按 ${keyLabel("skillUpgrade")} 打开技能）`);
  return result.levelsGained;
}

// 击杀结算：收益数值来自 combat.js，这里负责写回进度、日志与掉落触发。
export function defeat(target) {
  target.alive = false;
  target.respawn = target.boss ? 42 : target.npc ? 90 : rand(11, 20);
  target.hp = target.maxHp;
  if (target.npc) {
    // 击杀白名武者：罪恶值 +100，红名阈值 300（docs/05）；不影响关卡进度与掉落。
    state.player.sin = (state.player.sin || 0) + PK_RULES.sinPerKill;
    const red = state.player.sin >= PK_RULES.redNameThreshold;
    log(`<b>罪恶值 +${PK_RULES.sinPerKill}</b>：击杀白名武者，当前 ${state.player.sin}${red ? "，已红名" : ""}。`, "warn");
    sfx.redName();
    if (red) showToast("你已红名：死亡将掉落穿戴装备");
    state.player.targetId = null;
    setMoveTarget(null);
    return;
  }
  if (target.boss) sfx.bossKill();
  else sfx.kill();
  const hero = activeHero();
  const reward = computeKillReward({ target, quest: state.quest, rule: MAP_CLEAR_RULES[state.currentMapId] });
  // 0.3.2：经验真实结算并可升级（本关上限 = 主线等级 +1），不再把经验截断在 99。
  gainExperience(reward.expGain);
  state.player.gold += target.gold;
  state.player.totalKills += 1;
  state.player.kills += 1;
  if (!target.boss) state.quest.kills = Math.min(state.quest.need, state.quest.kills + 1);
  state.player.resource = clamp(state.player.resource + hero.resource * reward.resourceGainRatio, 0, hero.resource);
  state.player.charge = clamp(state.player.charge + reward.chargeGain, 0, 100);
  // 0.3.3 连击：3 秒内连续击杀累计连击，每 5 连击额外金币；只加金币不改经验曲线。
  const combo = registerComboKill({ count: fx.combo, timer: fx.comboTimer });
  fx.combo = combo.count;
  fx.comboTimer = combo.timer;
  if (combo.count >= 2) textAt(`${combo.count} 连击`, state.player.x, state.player.y - 64, "#e7b36b", 13 + Math.min(7, combo.count));
  if (combo.milestone) {
    state.player.gold += combo.bonusGold;
    log(`<b>${combo.count} 连击</b>：额外获得 ${combo.bonusGold} 金币（每 ${COMBO_RULES.bonusEvery} 连击奖励一次）。`, "loot");
  }
  if (target.boss) {
    // 首领倒下给一次更强的震屏，强调里程碑。
    fx.shake = 0.32;
    fx.shakePower = 7;
    state.player.marks += reward.marksGain;
    log(`<b>首领击破</b>：${target.name} 倒下，个人获得 ${reward.marksGain} 首领印记。`, "loot");
    showToast("首领结算完成：贡献快照已锁定");
    state.quest.bossDefeated = true;
  } else {
    log(`${target.name} 被击败，获得 ${reward.expGain} 经验与 ${target.gold} 金币。`);
    // 罪恶值只在危险区杀怪时下降（docs/05），安全区挂机不下降。
    if ((activeMap().danger === "danger" || activeMap().danger === "desolate") && state.player.sin > 0)
      state.player.sin = Math.max(0, state.player.sin - PK_RULES.sinDecayPerDangerKill);
  }
  spark(target.x, target.y, target.boss ? "#e7b36b" : "#d8e8dc", target.boss ? 30 : 16);
  const dropRolls = rollDropCount(target);
  for (let roll = 0; roll < dropRolls; roll += 1) spawnDrop(target, roll);
  const mapJustCompleted = checkMapCompletion();
  if (mapJustCompleted) autoSaveProgress(activeMap().name);
  state.player.targetId = null;
  setMoveTarget(null);
}

export function checkMapCompletion() {
  const map = activeMap();
  const rule = MAP_CLEAR_RULES[map.id];
  const progress = mapProgress();
  if (progress.kills >= progress.need && !progress.killAnnounced) {
    progress.killAnnounced = true;
    if (!progress.bossDefeated) {
      log(`清剿完成：下一步击败区域首领 <b>${rule.boss}</b>。`, "loot");
      showToast(`清剿完成，下一步：击败 ${rule.boss}`);
    }
  }
  progress.completed = progress.kills >= progress.need && progress.bossDefeated;
  if (!progress.completed || progress.completionAnnounced) return false;
  progress.completionAnnounced = true;
  if (!progress.rewardClaimed) {
    progress.rewardClaimed = true;
    state.player.gold += QUEST_REWARD.gold;
    state.player.marks += QUEST_REWARD.marks;
  }
  syncCampaignGrowth();
  log(`<b>剧情揭示</b>：${map.story.reveal}`, "loot");
  if (rule.next) {
    const nextMap = MAPS[rule.next];
    log(
      `<b>${map.name}通关</b>：${QUEST_REWARD.gold} 金币、${QUEST_REWARD.marks} 首领印记已发放。前往${rule.exit}进入<b>${nextMap.name}</b>。`,
      "loot"
    );
    showToast(`${map.name}已通关：前往${rule.exit}进入${nextMap.name}`);
  } else {
    log("<b>百图征途完成</b>：100 张地图与 100 名区域首领全部通关。", "loot");
    showToast("恭喜通关：一刀999 百图征途完成");
  }
  return true;
}

// 掉落生成：物品与随机都来自 drops.js，这里只把结果放进场景并写日志。
export function spawnDrop(source, roll = 0) {
  const map = activeMap();
  const item = rollDropItem({ source, mapDrops: map.drops, commonDrops: COMMON_DROPS, roll });
  state.drops.push(item);
  log(`${source.name} 掉落 <b style="color:${item.color}">${item.name}</b>，靠近后按 F 拾取。`, "loot");
}

// 战术节点激活：效果计算交给 drops.js，这里只负责写回、反馈与存档。
export function activateSitePoint(point) {
  if (!point || point.kind !== "site") return false;
  const progress = mapProgress();
  if (progress.siteClaimed) {
    const message = point.name + "已经激活过了";
    showToast(message);
    log(message + "。", "system");
    return true;
  }
  const effect = computeSiteEffect(point, { player: state.player, hero: activeHero(), entities: state.entities, maxHp: playerMaxHp() });
  Object.assign(state.player, effect.patch);
  if (effect.clearHazards) state.hazards = [];
  if (effect.retarget) setMoveTarget(null);
  const result = effect.result;
  progress.siteClaimed = true;
  spark(point.x, point.y, "#b99bea", 22);
  textAt("已激活", point.x, point.y - 30, "#d8c5ff", 14);
  log("<b>" + point.name + "</b>已激活：" + result + "。", "loot");
  showToast(point.name + "：" + result);
  persistGame();
  renderAll();
  return true;
}

export function collectDrops() {
  const nearby = state.drops.filter((drop) => distance(state.player, drop) < 85);
  if (!nearby.length) {
    const cache = (activeMap().tacticalPoints || []).find(
      (point) => point.kind === "resource" && distance(state.player, point) < point.radius
    );
    const progress = mapProgress();
    if (cache && !progress.resourceClaimed) {
      progress.resourceClaimed = true;
      const gold = 80 + activeMap().stageNumber * 4;
      state.player.gold += gold;
      state.player.potion += 1;
      state.player.marks += 2;
      log(`<b>${cache.name}</b>已搜索：生命药水 +1、金币 +${gold}、首领印记 +2。`, "loot");
      showToast(`${cache.name}已开启，奖励已自动保存`);
      persistGame();
      renderAll();
      return;
    }
    const site = (activeMap().tacticalPoints || []).find((point) => point.kind === "site" && distance(state.player, point) < point.radius);
    if (site) {
      activateSitePoint(site);
      return;
    }
    // 0.3.5：城镇内没有可拾取物时，F 改为与杂货商交易（开 / 关面板）。
    if (nearTown()) {
      toggleShop();
      return;
    }
    showToast(cache ? "秘藏补给箱已被搜索" : "附近没有可拾取物品");
    return;
  }
  state.inventory = state.inventory || [];
  let collected = 0;
  nearby.forEach((drop) => {
    if (!drop.kind && state.inventory.length >= 12) {
      log(`<b>${drop.name}</b> 未拾取：背包已满。`, "warn");
      return;
    }
    state.drops = state.drops.filter((entry) => entry.id !== drop.id);
    collected += 1;
    sfx.pickup();
    const pickup = computePickup(drop, { player: state.player, hero: activeHero() });
    if (pickup.toInventory) {
      if (drop.slot === "material") {
        // 材料堆叠：同名材料合并 count，基础材料不占满 12 格背包。
        state.inventory = stackMaterial(state.inventory, drop);
        const merged = state.inventory.find((entry) => entry.name === drop.name && entry.slot === "material");
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b> ×${merged?.count || 1}（材料已堆叠）。`, "loot");
      } else {
        state.inventory.push(drop);
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，点击背包查看属性。`, "loot");
      }
      return;
    }
    Object.assign(state.player, pickup.patch);
    if (pickup.log.type === "health_potion") log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，生命药水数量 +1。`, "loot");
    else if (pickup.log.type === "resource_potion")
      log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，恢复 ${pickup.log.amount} ${activeHero().resourceName}。`, "loot");
    else if (pickup.log.type === "gold")
      log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，获得 ${pickup.log.amount} 金币。`, "loot");
    else log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，首领印记 +3。`, "loot");
  });
  if (!collected) showToast("背包已满，装备仍保留在地面");
  if (collected) persistGame();
  renderPlayer();
  renderInventory();
}

export function equipItem(item) {
  if (!item || item.slot === "material") {
    showToast("材料可交易或用于铸魂，暂不能穿戴");
    return;
  }
  const previous = state.player.equipment[item.slot];
  state.player.equipment[item.slot] = item;
  state.inventory = (state.inventory || []).filter((entry) => entry.id !== item.id);
  if (previous) state.inventory.push(previous);
  sfx.pickup();
  log(
    `穿戴 <b style="color:${item.color}">${item.name}</b>，有效战力 ${effectiveItemPower(item)}${item.affixes?.length ? `（含 ${item.affixes.length} 条词缀）` : ""}。`,
    "loot"
  );
  showToast(`${item.name} 已装备，死亡掉落资格仍按绑定与区域规则判定`);
  persistGame();
  renderAll();
}

export function syncCampaignGrowth(silent = false) {
  const completedMaps = MAP_ORDER.filter((id) => state.mapProgress?.[id]?.completed).length;
  const growth = campaignGrowth(completedMaps);
  const previousLevel = state.player.level;
  const migrationFloor = Math.max(0, Number(state.player.migrationLevelFloor) || 0);
  const floorActive = migrationFloor > growth.level;
  // 0.3.2：击杀升级允许领先主线 1 级；通关同步时取「主线等级 / 已获得等级（上限 +1）/ 迁移下限」的最大值，
  // 因此不会把玩家刚刷出来的等级降回去，也不会让刷怪无限超出百图成长曲线。
  const earnedLevel = Math.min(Math.max(0, Number(state.player.level) || 0), growth.level + 1);
  state.player.level = floorActive ? migrationFloor : Math.max(growth.level, earnedLevel);
  // 经验始终对齐主线曲线（0/50/100），保证跨刷新恢复与百图 e2e 的成长断言一致。
  state.player.exp = floorActive ? 0 : growth.exp;
  state.player.nextExp = growth.nextExp;
  if (!floorActive && migrationFloor) delete state.player.migrationLevelFloor;
  if (growth.level > previousLevel && !silent) {
    state.player.skillPoints = (state.player.skillPoints || 0) + SKILL_UPGRADE.pointsPerLevel;
    state.player.hp = playerMaxHp();
    state.player.resource = activeHero().resource;
    sfx.levelup();
    log(`<b>等级提升</b>：百图历练达到 Lv.${growth.level}，当前阶段每 ${growth.mapsPerLevel} 张地图提升一级，技能点 +1。`, "loot");
    showToast(`升级成功：Lv.${growth.level}（技能点 +1，按 K 打开技能）`);
  }
}

export function playerDamage(dt) {
  const atWell = nearWaterWell();
  const atRestPoint = nearRestPoint();
  const atSanctuary = atWell || atRestPoint || nearTown();
  // 0.3.4 攻击前摇：每个存活敌人独立推进「蓄力 → 出手」节奏。
  // 蓄力期间 updateMonsterAI 会让怪物停步；前摇结束时玩家若已拉开距离 / 处于无敌，攻击落空。
  // 全局闸门 attackGate：任意一只怪出手后，所有怪物都要等 gate 秒才能再次抬手，
  // 这样「被 6 只怪围住」的承伤速率与旧实现（每帧只判定最近一只怪）持平，不会随怪物数量线性爆炸。
  const readyToWindup = [];
  let windingUp = 0;
  state.entities.forEach((attacker) => {
    if (!attacker.alive || attacker.friendly) return;
    const rules = attacker.boss ? MONSTER_ATTACK_RULES.boss : MONSTER_ATTACK_RULES.normal;
    const step = advanceMonsterAttack(
      { windup: attacker.windup, windupTotal: attacker.windupTotal, cooldown: attacker.attackCooldown },
      dt,
      rules
    );
    attacker.windup = step.windup;
    attacker.windupTotal = step.windupTotal;
    attacker.attackCooldown = step.cooldown;
    const reach = attacker.radius + 70;
    const inRange = !atSanctuary && distance(state.player, attacker) <= reach;
    // 只有已进入战斗的敌人才会抬手（首领视为始终接战）：避免路过时被一圈未反应过来的巡逻怪同时围攻。
    const engaged = Boolean(attacker.boss || attacker.aggro);
    if (step.strike) {
      // 出手即锁定全局闸门：不论命中还是落空，下一次怪物抬手都要重新等待。
      state.player.attackGate = rules.gate;
      if (inRange && state.player.invulnerable <= 0) {
        // 承伤公式与 docs/11 基线一致：减伤随攻击者等级衰减，后期不再恒定封顶。
        // 防御取「职业基础 + 装备防御词缀」（0.3.7 起装备防御真正参与结算）。
        const amount = computeIncomingDamage({ attack: attacker.attack, attackerLevel: attacker.level, defense: playerDefense() });
        if (TEST_MODE) console.info(`[dmg] ${attacker.id} ${amount}`);
        state.player.hp = Math.max(0, state.player.hp - amount);
        // 0.3.3 打击感：怪物命中玩家时在自身朝向玩家的方向闪一道红色挥击弧。
        attacker.attackFlash = 0.18;
        textAt(`-${amount}`, state.player.x, state.player.y - 30, "#f16d66", 13);
        spark(state.player.x, state.player.y, "#f16d66", 4);
        if (activeMap().boss.poisonStacks && attacker.boss) {
          state.player.poison = clamp(state.player.poison + 1, 0, 5);
          if (state.player.poison >= 5) showToast("毒层已满，靠近水井净化");
        }
      } else if (!atSanctuary) {
        // 落空：只保留视觉提示，不造成伤害。
        attacker.attackFlash = 0.12;
        textAt("落空", attacker.x, attacker.y - attacker.radius - 10, "#8d9ca0", 11);
      }
      return;
    }
    if (step.windup > 0) {
      windingUp += 1;
      return;
    }
    // 只有闸门空闲、已接战、玩家在范围内时才进入前摇；无敌期间不进入，避免空转。
    if (engaged && inRange && state.player.invulnerable <= 0 && state.player.attackGate <= 0) readyToWindup.push(attacker);
  });
  // 闸门空闲时把前摇名额给最近的一只怪（与旧实现「只判定最近一只」一致）。
  if (readyToWindup.length && MAX_WINDUP_ATTACKERS > windingUp) {
    const closest = readyToWindup.sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
    const rules = closest.boss ? MONSTER_ATTACK_RULES.boss : MONSTER_ATTACK_RULES.normal;
    closest.windup = rules.windup;
    closest.windupTotal = rules.windup;
  }
  // 危险区地面危险区伤害（BOSS阶段二以上）
  state.hazards.forEach((h) => {
    if (h.snap) return;
    h.life -= dt;
    if (h.life <= 0) {
      h.snap = true;
      if (!atSanctuary && state.player.invulnerable <= 0 && distance(state.player, h) < h.r) {
        const amount = computeIncomingDamage({ attack: h.damage, attackerLevel: h.attackerLevel, defense: playerDefense() });
        state.player.hp = Math.max(0, state.player.hp - amount);
        textAt(`-${amount}`, state.player.x, state.player.y - 30, "#f16d66", 14);
        spark(state.player.x, state.player.y, "#f16d66", 6);
      }
    }
  });
  state.hazards = state.hazards.filter((h) => !h.snap || h.fade > 0);
  state.hazards.forEach((h) => {
    if (h.snap) h.fade -= dt;
  });
  // 中毒持续伤害（无敌期间只保留毒层，不结算伤害）
  if (state.player.poison > 0 && !atSanctuary && state.player.invulnerable <= 0) {
    state.player.poisonTimer = (state.player.poisonTimer || 0) - dt;
    if (state.player.poisonTimer <= 0) {
      state.player.poisonTimer = 1.2;
      const amount = state.player.poison * 4;
      state.player.hp = Math.max(0, state.player.hp - amount);
      textAt(`-${amount}`, state.player.x, state.player.y - 30, "#a88ce3", 12);
    }
  } else if (atSanctuary && state.player.poison > 0) {
    state.player.poison = Math.max(0, state.player.poison - Math.max(1, Math.ceil(dt * (atWell ? 2 : 1))));
    state.player.poisonTimer = 1.2;
    textAt(atWell ? "净化" : atRestPoint ? "篝火" : "安全区", state.player.x, state.player.y - 40, atWell ? "#5a7090" : "#62d5c6", 14);
  }
  if (atSanctuary && state.player.hp < playerMaxHp()) {
    state.player.hp = clamp(state.player.hp + Math.max(1, Math.round(playerMaxHp() * 0.1 * dt)), 0, playerMaxHp());
    state.player.resource = clamp(
      state.player.resource + Math.max(1, Math.round(activeHero().resource * 0.08 * dt)),
      0,
      activeHero().resource
    );
  }
  if (state.player.hp <= 0) die();
}

export function die() {
  const mapId = state.currentMapId;
  const town = activeMap().townRect;
  const safeSpawn = { x: town.x + town.w / 2, y: town.y + town.h / 2 };
  state.player.deaths = (state.player.deaths || 0) + 1;
  sfx.death();
  // 红名死亡爆装（docs/05 原型：掉 1 件穿戴装备在倒下位置，装备锁定不保护死亡掉落）。
  if (isRedName()) {
    const filled = EQUIPMENT_SLOT_KEYS.filter((slotKey) => state.player.equipment?.[slotKey]);
    if (filled.length) {
      const slotKey = filled[Math.floor(Math.random() * filled.length)];
      const dropped = state.player.equipment[slotKey];
      state.player.equipment[slotKey] = null;
      state.drops.push({ ...dropped, x: state.player.x + rand(-30, 30), y: state.player.y + rand(-24, 24), source: "红名死亡" });
      log(`<b>红名死亡爆装</b>：<b style="color:${dropped.color}">${dropped.name}</b> 掉落在倒下位置。`, "warn");
    }
  }
  state.player.hp = Math.round(playerMaxHp() * 0.55);
  state.player.resource = activeHero().resource * 0.45;
  state.player.invulnerable = 3;
  state.player.targetId = null;
  state.player.poison = 0;
  setMoveTarget(null);
  log(`<b>你在野外倒下</b>，已返回${activeMap().name}安全营地；当前关卡进度保留。`, "warn");
  showToast("已在当前地图安全区复活");
  loadMap(mapId, safeSpawn.x, safeSpawn.y, true);
}

export function movePlayer(dt) {
  const hero = activeHero();
  const map = activeMap();
  let dx = 0,
    dy = 0;
  if (keys.w || keys.arrowup) dy -= 1;
  if (keys.s || keys.arrowdown) dy += 1;
  if (keys.a || keys.arrowleft) dx -= 1;
  if (keys.d || keys.arrowright) dx += 1;
  if (dx || dy) setMoveTarget(null);
  // 键盘优先；没有键盘输入时读虚拟摇杆，推力大小按摇杆偏移量缩放（键盘与点击寻路保持全速）。
  let intensity = 1;
  if (!dx && !dy && joystick.active && (joystick.x || joystick.y)) {
    dx = joystick.x;
    dy = joystick.y;
    intensity = Math.min(1, Math.hypot(dx, dy));
    setMoveTarget(null);
  }
  if (!dx && !dy && moveTarget) {
    dx = moveTarget.x - state.player.x;
    dy = moveTarget.y - state.player.y;
    if (Math.hypot(dx, dy) < 8) setMoveTarget(null);
  }
  const length = Math.hypot(dx, dy) || 1;
  if (dx || dy) {
    state.player.x += (dx / length) * hero.speed * intensity * dt;
    state.player.y += (dy / length) * hero.speed * intensity * dt;
  }
  state.player.x = clamp(state.player.x, 55, map.width - 55);
  state.player.y = clamp(state.player.y, 55, map.height - 55);
  // 出口触发
  map.exits.forEach((exit) => {
    if (state.player.x >= exit.x && state.player.x <= exit.x + exit.w && state.player.y >= exit.y && state.player.y <= exit.y + exit.h) {
      tryTravel(exit);
    }
  });
}

export function tryTravel(exit) {
  if (pendingTravel && pendingTravel.target === exit.target) return;
  if (isForwardExit(exit) && !mapProgress().completed) {
    const rule = MAP_CLEAR_RULES[state.currentMapId];
    const progress = mapProgress();
    const missing = [];
    if (progress.kills < progress.need) missing.push(`再击败 ${progress.need - progress.kills} 只普通怪物`);
    if (!progress.bossDefeated) missing.push(`击败 ${rule.boss}`);
    const message = `前进出口尚未开启：${missing.join("，")}`;
    showToast(message);
    log(message, "warn");
    state.player.x = exit.x < activeMap().width / 2 ? exit.x + exit.w + 70 : exit.x - 70;
    return;
  }
  const target = MAPS[exit.target];
  if (state.player.level < target.levelMin - 2) {
    // 低等级进入高压图：游戏内确认弹层（替代阻塞主线程的 window.confirm）。
    pendingTravel = exit;
    renderTravelConfirm({ exit, target });
    return;
  }
  doTravel(exit, target);
}

function doTravel(exit, target) {
  pendingTravel = null;
  sfx.travel();
  log(`通过出口前往 <b>${target.name}</b>……`, "loot");
  loadMap(exit.target, exit.spawn.x, exit.spawn.y);
}

export function confirmTravel() {
  if (!pendingTravel) return;
  const exit = pendingTravel;
  doTravel(exit, MAPS[exit.target]);
}

export function cancelTravel() {
  if (!pendingTravel) return;
  const exit = pendingTravel;
  pendingTravel = null;
  renderTravelConfirm(null);
  // 把玩家弹回安全方向
  state.player.x = Math.max(60, exit.x - 80);
  showToast("已取消进入");
}

export function updateEntities(dt) {
  const map = activeMap();
  state.entities.forEach((entity) => {
    entity.hitFlash = Math.max(0, entity.hitFlash - dt);
    entity.attackFlash = Math.max(0, (entity.attackFlash || 0) - dt);
    // 破甲计时对所有可受击目标生效；过期后 computeDamage 自动恢复原防御。
    if (entity.armorBreakTimer > 0) tickArmorBreak(entity, dt);
    // 召唤物：骨卫走独立的跟随 / 索敌逻辑，不参与怪物巡逻与复活。
    if (entity.summoned) {
      updateSummon(entity, dt);
      return;
    }
    if (!entity.alive) {
      entity.respawn -= dt;
      if (entity.respawn <= 0) {
        entity.alive = true;
        entity.hp = entity.maxHp;
        // 复活时清空攻击节奏与破甲状态，避免重生立刻抬手或保留旧破甲。
        entity.windup = 0;
        entity.attackCooldown = entity.boss ? 0.8 : rand(1.2, 2.9);
        entity.armorBreakTimer = 0;
        if (entity.boss) {
          entity.phase = 1;
          entity.specialTimer = map.boss.specialInterval;
          entity.summonTimer = map.boss.summonInterval || 0;
          log(`<b>首领情报</b>：${entity.name} 重新进入场景。`, "warn");
        }
      }
      return;
    }
    if (!entity.boss) updateMonsterAI(entity, dt);
    if (entity.boss) updateBoss(entity, dt);
  });
  // 召唤时限结束的骨卫从实体表移除，避免留下 alive=false 但无 respawn 的残影。
  state.entities = state.entities.filter((entity) => !(entity.summoned && !entity.alive));
}

// 骨卫 AI（0.3.4）：优先跟随玩家，附近有敌人时自动索敌并按固定冷却出手；
// 伤害复用玩家伤害公式的 40% 倍率，命中反馈与普攻一致。
export function updateSummon(guard, dt) {
  if (!guard.alive) return;
  guard.summonLife -= dt;
  if (guard.summonLife <= 0) {
    guard.alive = false;
    spark(guard.x, guard.y, "#cfd8cf", 12);
    log("骨卫的召唤时限结束，化作骨尘散去。", "warn");
    return;
  }
  guard.attackCooldown = Math.max(0, (guard.attackCooldown || 0) - dt);
  const foe = pickSummonTarget({ guard, entities: state.entities });
  const anchor = { x: state.player.x - 38, y: state.player.y + 30 };
  const chase = foe && distance(state.player, foe) <= SKILL_RULES.summon.engageRange;
  const moveTo = chase ? foe : anchor;
  const gap = Math.hypot(moveTo.x - guard.x, moveTo.y - guard.y);
  const stopGap = chase ? guard.radius + (foe.radius || 0) + SKILL_RULES.summon.attackGap : 6;
  if (gap > stopGap) {
    const speed = chase ? 180 : 150;
    guard.x += ((moveTo.x - guard.x) / gap) * speed * dt;
    guard.y += ((moveTo.y - guard.y) / gap) * speed * dt;
  }
  const map = activeMap();
  guard.x = clamp(guard.x, 55, map.width - 55);
  guard.y = clamp(guard.y, 55, map.height - 55);
  const reach = guard.radius + (foe?.radius || 0) + SKILL_RULES.summon.attackGap;
  if (foe && distance(guard, foe) <= reach && guard.attackCooldown <= 0) {
    guard.attackCooldown = SKILL_RULES.summon.cooldown;
    guard.attackFlash = 0.18;
    resolveDamage(foe, SKILL_RULES.summon.attackRatio, null, "普通");
  }
}

// 普通怪 / 流浪武者 AI：绕刷新点巡逻 → 靠近玩家进入仇恨追击 → 距离过远脱战回归。
// 追击速度低于玩家移速，保证可以走位拉开；安全区内不触发仇恨。
export function updateMonsterAI(entity, dt) {
  const player = state.player;
  entity.wander += dt;
  const sanctuary = nearTown() || nearRestPoint() || nearWaterWell();
  const distToPlayer = distance(entity, player);
  const anchorDistance = Math.hypot(entity.x - entity.spawnX, entity.y - entity.spawnY);
  const canAggro = !entity.npc || entity.hostile;
  if (!entity.aggro && canAggro && !sanctuary && player.invulnerable <= 0 && distToPlayer < 190) entity.aggro = true;
  if (entity.aggro && (distToPlayer > 340 || anchorDistance > 430 || sanctuary)) entity.aggro = false;
  // 0.3.4 攻击前摇：蓄力期间原地不动，玩家可在红色蓄力环收拢前走位躲开（前摇结束落空）。
  if (entity.windup > 0) return;
  let targetX;
  let targetY;
  let speed;
  if (entity.aggro) {
    const dx = player.x - entity.x;
    const dy = player.y - entity.y;
    const length = Math.hypot(dx, dy) || 1;
    const stopAt = Math.max(0, length - 46);
    targetX = entity.x + (dx / length) * stopAt;
    targetY = entity.y + (dy / length) * stopAt;
    speed = 132;
  } else {
    targetX = entity.spawnX + Math.cos(entity.wander * 0.7) * entity.patrolRadius;
    targetY = entity.spawnY + Math.sin(entity.wander * 0.55) * entity.patrolRadius;
    speed = 42;
  }
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const length = Math.hypot(dx, dy);
  if (length > 4) {
    entity.x += (dx / length) * speed * dt;
    entity.y += (dy / length) * speed * dt;
  }
  const map = activeMap();
  entity.x = clamp(entity.x, 55, map.width - 55);
  entity.y = clamp(entity.y, 55, map.height - 55);
}

export function updateBoss(boss, dt) {
  const map = activeMap();
  const hpRatio = boss.hp / boss.maxHp;
  const def = map.boss;
  let newPhase = 1;
  if (def.phases >= 3) {
    newPhase = hpRatio > def.phase1Trigger ? 1 : hpRatio > def.phase2Trigger ? 2 : 3;
  } else if (def.phases === 2) {
    newPhase = hpRatio > def.phase1Trigger ? 1 : 2;
  }
  if (newPhase !== boss.phase) {
    boss.phase = newPhase;
    sfx.phase();
    const phaseName =
      def.phases >= 3
        ? newPhase === 2
          ? "地裂逼迫移动"
          : "吞噬技能书幻影"
        : map.id === "pine_forest"
          ? "落木狂暴"
          : map.id === "red_sand_desert"
            ? "水井净化"
            : "狂暴";
    log(`<b>${boss.name}</b> 进入阶段 ${newPhase}：${phaseName}。`, "warn");
    showToast(`${boss.name} 阶段 ${newPhase}：${phaseName}`);
    spark(boss.x, boss.y, "#e7b36b", 24);
  }
  // 召唤腐工（坑道尸皇阶段1）
  if (def.summonMob !== undefined && boss.phase === 1) {
    boss.summonTimer -= dt;
    if (boss.summonTimer <= 0) {
      boss.summonTimer = def.summonInterval;
      const aliveMobs = state.entities.filter((e) => e.alive && !e.boss).length;
      if (aliveMobs < def.summonMax + 8) {
        const type = map.monsterTypes[def.summonMob];
        const id = `summon-${Date.now()}-${Math.random()}`;
        state.entities.push({
          id,
          ...type,
          level: map.levelMax,
          x: boss.x + rand(-80, 80),
          y: boss.y + rand(-60, 60),
          maxHp: type.hp,
          alive: true,
          hitFlash: 0,
          wander: Math.random() * 6,
          poisonTimer: 0,
          friendly: false,
          attackCooldown: 0.5,
          windup: 0,
          windupTotal: MONSTER_ATTACK_RULES.normal.windup,
          armorBreakTimer: 0
        });
        log(`<b>${boss.name}</b> 召唤了一只 ${type.name}。`, "warn");
        spark(boss.x + 60, boss.y, "#7a5a3a", 8);
      }
    }
  }
  // 危险区技能
  boss.specialTimer -= dt;
  if (boss.specialTimer <= 0 && boss.phase >= 2) {
    boss.specialTimer = Math.max(2, def.specialInterval - boss.phase * 0.8);
    spawnHazard(boss);
  }
}

export function spawnHazard(boss) {
  const map = activeMap();
  const def = map.boss;
  const radius = def.specialKind === "logs" ? 50 : def.specialKind === "devour" ? 70 : 55;
  const damage = Math.round(boss.attack * 1.4);
  let target;
  if (def.specialKind === "logs") {
    // 森林巨猿：在玩家附近随机落木
    target = { x: state.player.x + rand(-100, 100), y: state.player.y + rand(-100, 100) };
  } else if (def.specialKind === "sting") {
    // 沙蝎王：尾刺方向
    target = { x: state.player.x, y: state.player.y };
  } else {
    // 坑道尸皇：地裂/吞噬在前方
    const angle = rand(0, Math.PI * 2);
    target = { x: boss.x + Math.cos(angle) * rand(80, 200), y: boss.y + Math.sin(angle) * rand(80, 200) };
  }
  target.r = radius;
  target.life = 1.2;
  target.snap = false;
  target.fade = 0.5;
  target.damage = damage;
  target.attackerLevel = boss.level;
  state.hazards.push(target);
  state.hazardsSpawned = (state.hazardsSpawned || 0) + 1;
  if (Math.random() < 0.6) log(`<b>${boss.name}</b> 蓄力中：地面危险区即将爆发，离开红圈！`, "warn");
}

// 生息法阵结算（0.3.4）：站在阵中每秒回 8% 最大生命，离开立即失效，4 秒后自然结束。
export function updateHealZones(dt) {
  if (!state?.healZones?.length) return;
  state.healZones = state.healZones.filter((zone) => {
    const result = advanceHealZone({ zone, player: state.player, dt, maxHp: playerMaxHp() });
    if (result.left) {
      log("离开生息法阵，持续回复中断。", "warn");
      showToast("已离开生息法阵");
      return false;
    }
    zone.life = result.life;
    zone.tick = result.tick;
    if (result.heal > 0) {
      state.player.hp = clamp(state.player.hp + result.heal, 0, playerMaxHp());
      textAt(`+${result.heal}`, state.player.x, state.player.y - 30, "#a88ce3", 15);
      spark(state.player.x, state.player.y, "#a88ce3", 5);
    }
    return result.active;
  });
}

export function update(dt) {
  if (!state) return;
  const hero = activeHero();
  state.player.attackTimer = Math.max(0, state.player.attackTimer - dt);
  state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);
  // 全局出手闸门（0.3.4）：任意怪物出手后需等 gate 秒，任何怪才能再次抬手。
  // 这里必须逐帧递减，否则闸门一旦被写入就会永久锁死怪物的攻击。
  state.player.attackGate = Math.max(0, (state.player.attackGate || 0) - dt);
  state.player.cooldowns = state.player.cooldowns.map((cd) => Math.max(0, cd - dt));
  if (state.player.resource < hero.resource)
    state.player.resource = clamp(state.player.resource + hero.resource * 0.008 * dt, 0, hero.resource);
  // 打击感瞬时状态衰减：连击计时、震屏、升级闪光（只影响绘制，不影响战斗数值）。
  const combo = advanceCombo({ count: fx.combo, timer: fx.comboTimer }, dt);
  fx.combo = combo.count;
  fx.comboTimer = combo.timer;
  fx.shake = Math.max(0, fx.shake - dt);
  fx.levelUp = Math.max(0, fx.levelUp - dt);
  // 穿透光束只做视觉衰减，不参与伤害结算。
  if (fx.pierce) {
    fx.pierce.life -= dt;
    if (fx.pierce.life <= 0) fx.pierce = null;
  }
  movePlayer(dt);
  // 杂货商面板只在城镇内有效：走出城镇范围立即收起（面板内容仍由 renderAll 刷新）。
  if (state.shopOpen && !nearTown()) state.shopOpen = false;
  updateEntities(dt);
  updateHealZones(dt);
  playerDamage(dt);
  state.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 90 * dt;
    particle.life -= dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.texts.forEach((text) => {
    text.y += text.vy * dt;
    text.life -= dt;
  });
  state.texts = state.texts.filter((text) => text.life > 0);
  renderAll();
}

export function autoSaveProgress(mapName) {
  if (!persistGame()) return;
  log(`<b>${mapName}通关进度已自动保存</b>：刷新或任务中断后会从当前地图恢复。`, "loot");
  showToast(`${mapName}已通关并自动保存`);
}

export function saveGame() {
  if (!persistGame()) return;
  showToast("进度已保存在本机浏览器");
  log("进度已保存：下次打开可继续当前职业、装备与地图通关状态。", "loot");
}
export function loadGame() {
  try {
    const restored = readSavedGame();
    if (!restored) return false;
    const { saved, migrated, fromVersion } = restored;
    setState(createState(saved.classId));
    Object.assign(state.player, saved.player);
    state.player.previewSkill = null;
    state.player.equipment = saved.equipment || saved.player.equipment || {};
    state.player.skillPoints = saved.player.skillPoints || 0;
    state.player.skillLevels = saved.player.skillLevels || [0, 0, 0, 0];
    state.player.sin = saved.player.sin || 0;
    state.player.deaths = saved.player.deaths || 0;
    // 恢复时规范化背包：合并旧档 / 迁移存档中重复的同名材料（0.3.0 材料堆叠）。
    state.inventory = normalizeInventory(saved.inventory);
    state.mapProgress = saved.mapProgress || {};
    if (saved.quest && saved.currentMapId && !state.mapProgress[saved.currentMapId]) state.mapProgress[saved.currentMapId] = saved.quest;
    syncCampaignGrowth(true);
    const startMap = saved.currentMapId && MAPS[saved.currentMapId] ? saved.currentMapId : "ash_outskirts";
    loadMap(startMap, state.player.x || 480, state.player.y || 780, true);
    $("classModal").classList.add("hidden");
    if (migrated) {
      persistGame();
      log(`已将 v${fromVersion} 存档迁移到 v${CURRENT_SAVE_VERSION}：旧存档保留，地图、装备和原等级已继续使用。`, "loot");
    } else log("已恢复本机进度：服务器规则仍以当前版本为准。", "loot");
    return true;
  } catch (error) {
    // 存档损坏时回退到职业选择，但要留下诊断线索而不是静默吞掉。
    console.warn("[oneknife999] 存档读取失败，已回退到新档：", error);
    return false;
  }
}
export function resetGame() {
  clearStorage();
  setState(null);
  $("classModal").classList.remove("hidden");
  showToast("旧存档已清除，请选择职业开始新的边境旅程");
}

export function setupClasses() {
  $("classOptions").innerHTML = Object.entries(CLASSES)
    .map(
      ([id, hero]) =>
        `<button class="class-option" data-class="${id}" style="--class-color:${hero.color}"><span class="class-glyph">${hero.glyph}</span><span><h3>${hero.name}</h3><p>${hero.subtitle}</p><span class="class-stat">生命 ${hero.hp} · ${hero.resourceName} ${hero.resource}</span></span></button>`
    )
    .join("");
  $("classOptions")
    .querySelectorAll("button")
    .forEach((button) => button.addEventListener("click", () => chooseClass(button.dataset.class)));
}

export function usePotion() {
  if (!state || state.player.potion <= 0) {
    showToast("生命药水已用完");
    return;
  }
  const maxHp = playerMaxHp();
  if (state.player.hp >= maxHp) {
    showToast("生命值已满");
    return;
  }
  state.player.potion -= 1;
  const restore = Math.round(maxHp * 0.32);
  state.player.hp = clamp(state.player.hp + restore, 0, maxHp);
  sfx.potion();
  textAt(`+${restore}`, state.player.x, state.player.y - 32, "#78b6ec", 15);
  log(`使用生命药水，恢复 ${restore} 点生命。`);
  persistGame();
}

// 强化当前穿戴的装备（docs/03：+1~+5 必成，失败不降级不销毁，+10 起失败积累祝福值）。
export function enhanceItem(slotKey) {
  if (!state) return;
  const item = state.player.equipment?.[slotKey];
  if (!item) {
    showToast("该部位没有穿戴装备");
    return;
  }
  const quote = enhanceQuote(item, state.player.gold, state.inventory || []);
  if (!quote.canEnhance) {
    showToast(quote.reason);
    return;
  }
  state.player.gold -= quote.cost;
  if (quote.materialNeeded) {
    // 消耗 1 件材料：堆叠材料 count-1，count 归零时移除（0.3.0 材料堆叠后）。
    const materialIndex = (state.inventory || []).findIndex((entry) => entry.slot === "material");
    const material = state.inventory[materialIndex];
    const count = material?.count || 1;
    if (count > 1) material.count = count - 1;
    else state.inventory.splice(materialIndex, 1);
  }
  const success = quote.rate >= 1 || Math.random() < quote.rate;
  if (success) {
    item.enhance = (item.enhance || 0) + 1;
    item.blessing = 0;
    sfx.enhanceSuccess();
    log(`强化成功：<b style="color:${item.color}">${item.name} +${item.enhance}</b>，有效战力 ${effectiveItemPower(item)}。`, "loot");
    showToast(`${item.name} 强化至 +${item.enhance}`);
  } else {
    const target = (item.enhance || 0) + 1;
    const tier = ENHANCE_RULES.rates.find((rule) => target >= rule.from && target <= rule.to);
    if (target >= 10) item.blessing = Math.min(100, (item.blessing || 0) + (tier?.blessingOnFail || 0));
    sfx.enhanceFail();
    log(
      `强化失败：${item.name} 保持 +${item.enhance || 0}${item.blessing ? `，祝福值 ${item.blessing}%` : "（不降级、不销毁）"}。`,
      "warn"
    );
    showToast(`强化失败，保持 +${item.enhance || 0}`);
  }
  persistGame();
  renderPlayer();
  renderInventory();
}

// 拆解背包装备（docs/03：返还 50% 基础强化材料与 10% 价值金币）。
// 材料/消耗品/货币不可拆解；返还的基础材料与掉落共用堆叠（同名合并 count）。
export function salvageItem(itemId) {
  const item = (state.inventory || []).find((entry) => entry.id === itemId);
  if (!item || item.slot === "material" || item.slot === "consumable" || item.slot === "currency") {
    showToast("该物品不能拆解");
    return;
  }
  const { rewards } = salvageReward(item);
  state.inventory = state.inventory.filter((entry) => entry.id !== itemId);
  for (const reward of rewards) {
    if (reward.kind === "gold") state.player.gold += reward.amount;
    else state.inventory = stackMaterial(state.inventory, reward);
  }
  const gold = rewards.find((reward) => reward.kind === "gold")?.amount || 0;
  sfx.salvage();
  log(`拆解 <b style="color:${item.color}">${item.name}</b>：返还 1 黑铁矿石与 ${gold} 金币。`, "loot");
  showToast(`${item.name} 已拆解，获得基础材料与 ${gold} 金币`);
  persistGame();
  renderPlayer();
  renderInventory();
}

// ============ 城镇杂货商与词缀重铸（0.3.5，docs/07 金币消耗出口） ============

// 开 / 关杂货商面板：只在城镇内可用；离开城镇后由 update 自动收起。
export function toggleShop() {
  if (!state) return;
  if (!nearTown()) {
    showToast("需要回到城镇才能与杂货商交易");
    return;
  }
  state.shopOpen = !state.shopOpen;
  renderAll();
  if (state.shopOpen) showToast("杂货商：可用金币购买药水、材料与词缀重铸卷");
}

export function closeShop() {
  if (!state?.shopOpen) return;
  state.shopOpen = false;
  renderAll();
}

// 购买商品：金币扣减与写回（药水 / 材料 / 重铸卷）集中在这里，价格校验在 shop.js。
export function buyGoods(goodId) {
  if (!state) return;
  if (!nearTown()) {
    state.shopOpen = false;
    showToast("离开城镇后杂货商不再营业");
    renderAll();
    return;
  }
  const purchase = buyShopItem(goodId, { gold: state.player.gold });
  if (!purchase.ok) {
    showToast(purchase.reason);
    return;
  }
  const good = purchase.good;
  state.player.gold -= purchase.price;
  if (good.effect === "potion") state.player.potion += 1;
  else if (good.effect === "scroll") state.player.reforgeScroll = (state.player.reforgeScroll || 0) + 1;
  else if (good.effect === "material") {
    // 与掉落共用堆叠：同名材料合并 count，不额外占背包格。
    state.inventory = stackMaterial(state.inventory || [], { ...BASIC_MATERIAL, id: `shop-${Date.now()}` });
  }
  const owned =
    good.effect === "potion"
      ? `生命药水 ×${state.player.potion}`
      : good.effect === "scroll"
        ? `词缀重铸卷 ×${state.player.reforgeScroll || 0}`
        : `黑铁矿石 ×${(state.inventory || []).find((entry) => entry.slot === "material" && entry.name === BASIC_MATERIAL.name)?.count || 1}`;
  sfx.pickup();
  log(`杂货商：花费 ${purchase.price} 金币购买 <b>${good.name}</b>，当前${owned}。`, "loot");
  showToast(`${good.name} 已购买，剩余金币 ${state.player.gold}`);
  persistGame();
  renderAll();
}

// 词缀重铸：重掷穿戴装备的一条词缀（白板装备则新附一条），消耗 1 张重铸卷与金币。
export function reforgeEquipped(slotKey) {
  if (!state) return;
  const item = state.player.equipment?.[slotKey];
  const quote = reforgeQuote(item, { gold: state.player.gold, scrolls: state.player.reforgeScroll || 0 });
  if (!quote.canReforge) {
    showToast(quote.reason);
    return;
  }
  const result = reforgeAffix(item, { level: state.player.level, random: Math.random });
  state.player.gold -= quote.cost;
  state.player.reforgeScroll = Math.max(0, (state.player.reforgeScroll || 0) - quote.scrollNeeded);
  state.player.equipment[slotKey] = result.item;
  const describe = (affix) => (affix ? `${affix.label} +${affix.value}${affix.percent ? "%" : ""}` : "无词缀");
  sfx.enhanceSuccess();
  textAt(`重铸 ${describe(result.newAffix)}`, state.player.x, state.player.y - 34, "#a88ce3", 14);
  log(
    `词缀重铸：<b style="color:${item.color}">${item.name}</b> ${
      result.index >= 0 ? `${describe(result.oldAffix)} → ${describe(result.newAffix)}` : `新附 ${describe(result.newAffix)}`
    }，消耗 ${quote.cost} 金币与 ${quote.scrollNeeded} 张词缀重铸卷。`,
    "loot"
  );
  showToast(`${item.name} 重铸完成：${describe(result.newAffix)}`);
  persistGame();
  renderAll();
}

// 技能升级（docs/02「每级提高倍率」的原型简化：每级 +6% 技能倍率，升级获得技能点）。
export function upgradeSkill(index) {
  if (!state) return;
  const skill = activeHero().skills[index];
  if (!skill) return;
  const level = state.player.skillLevels?.[index] || 0;
  if (level >= SKILL_UPGRADE.maxLevel) {
    showToast("该技能已达原型上限");
    return;
  }
  if ((state.player.skillPoints || 0) < 1) {
    showToast("技能点不足：升级自动获得");
    return;
  }
  state.player.skillPoints -= 1;
  state.player.skillLevels[index] = level + 1;
  sfx.skillUp();
  persistGame();
  log(`<b>${skill.name}</b> 升至 ${level + 1} 级：技能倍率 +${Math.round(SKILL_UPGRADE.multiplierPerLevel * 100)}%。`, "loot");
  showToast(`${skill.name} Lv.${level + 1}`);
}

// 导出存档为 JSON 文件（换设备 / 备份）。
export function exportSave() {
  if (!persistGame()) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showToast("没有可导出的存档");
    return;
  }
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `oneknife999-save-v${CURRENT_SAVE_VERSION}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("存档已导出为 JSON 文件");
}

// 导入存档 JSON：校验职业字段后写入并刷新。
export function importSave(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || !CLASSES[parsed.classId]) throw new Error("invalid save");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      showToast("存档已导入，正在刷新……");
      setTimeout(() => window.location.reload(), 400);
    } catch {
      showToast("导入失败：不是有效的存档文件");
    }
  };
  reader.readAsText(file);
}

function frame(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.05);
  lastTime = timestamp;
  update(dt);
  requestAnimationFrame(frame);
}
if (TEST_MODE) {
  window.__ONEKNIFE_E2E__ = {
    catalog: () =>
      JSON.parse(
        JSON.stringify(
          MAP_ORDER.map((id) => ({
            id,
            need: MAP_CLEAR_RULES[id].kills,
            stageNumber: MAP_CLEAR_RULES[id].stageNumber,
            boss: MAPS[id].boss.name,
            bossPhases: MAPS[id].boss.phases,
            bossPoint: { x: MAPS[id].boss.x, y: MAPS[id].boss.y, radius: MAPS[id].boss.radius },
            monsterSpawns: MAPS[id].monsterSpawns.map(([x, y, type, route, progress]) => ({
              x,
              y,
              type,
              route: route || "main",
              progress: progress ?? null
            })),
            specialRect: MAPS[id].specialRect ? { ...MAPS[id].specialRect } : null,
            layoutId: MAPS[id].layoutId || `handcrafted-${id}`,
            layoutSignature: mapLayoutSignature(MAPS[id]),
            siteArchetype: MAPS[id].siteStyle?.arena || "handcrafted",
            siteDetail: MAPS[id].siteStyle?.detail || "手工地图",
            road: MAPS[id].siteStyle?.road || "handcrafted",
            pathCount: MAPS[id].paths?.length || 0,
            pathTurnCount: MAPS[id].paths?.[0] ? pathTurnCount(MAPS[id].paths[0]) : 0,
            pathLengths: (MAPS[id].paths || []).map(pathLength),
            branchPath: MAPS[id].branchPath ? [...MAPS[id].branchPath] : null,
            routePlan: MAPS[id].routePlan || null,
            encounterBands: MAPS[id].encounterBands || [],
            monsterProfiles: MAPS[id].monsterTypes.map(({ name, intro, skills }) => ({ name, intro, skills })),
            storyBeat: MAPS[id].story.beatTitle,
            storyObjective: MAPS[id].story.objective,
            tacticalPoints: (MAPS[id].tacticalPoints || []).map(({ kind, route, effect, x, y, radius, name, detail }) => ({
              kind,
              route,
              effect,
              x,
              y,
              radius,
              name,
              detail
            })),
            sitePoint: (MAPS[id].tacticalPoints || []).find((point) => point.kind === "site") || null,
            safePoint: { x: MAPS[id].townRect.x + MAPS[id].townRect.w / 2, y: MAPS[id].townRect.y + MAPS[id].townRect.h / 2 }
          }))
        )
      ),
    // 相机 / 视口 / 职业基础数据：e2e 直接读取游戏侧几何，替代测试内镜像实现。
    meta: () => ({ viewScale: getViewScale(), camera: getCamera(), heroBaseHp: activeHero().hp, attackRange: activeHero().range }),
    snapshot: () =>
      state
        ? JSON.parse(
            JSON.stringify({
              currentMapId: state.currentMapId,
              stageNumber: MAP_CLEAR_RULES[state.currentMapId].stageNumber,
              classId: state.classId,
              travelPrompt: pendingTravel ? pendingTravel.target : null,
              player: {
                x: state.player.x,
                y: state.player.y,
                hp: state.player.hp,
                // 含装备生命加成的真实上限：探针 / e2e 判断「半血」时必须用它，否则会误判。
                maxHp: playerMaxHp(),
                resource: state.player.resource,
                poison: state.player.poison,
                charge: state.player.charge,
                level: state.player.level,
                exp: state.player.exp,
                nextExp: state.player.nextExp,
                potion: state.player.potion,
                gold: state.player.gold,
                marks: state.player.marks,
                deaths: state.player.deaths || 0,
                sin: state.player.sin || 0,
                skillPoints: state.player.skillPoints || 0,
                skillLevels: [...(state.player.skillLevels || [0, 0, 0, 0])],
                targetId: state.player.targetId,
                previewSkill: state.player.previewSkill
              },
              inventoryCount: (state.inventory || []).length,
              equipmentIds: Object.fromEntries(
                Object.entries(state.player.equipment || {}).map(([slot, item]) => [slot, item?.id || null])
              ),
              // 骨卫等友军不进入 e2e 快照：测试脚本把快照里的实体都当可攻击怪物，会误锁定友军。
              entities: state.entities
                .filter((entity) => !entity.friendly)
                .map((entity) => ({
                  id: entity.id,
                  x: entity.x,
                  y: entity.y,
                  hp: entity.hp,
                  // 探针 / e2e 需要目标上限计算百分比（此前漏字段会打印 NaN）。
                  maxHp: entity.maxHp,
                  alive: entity.alive,
                  boss: Boolean(entity.boss),
                  npc: Boolean(entity.npc),
                  phase: entity.phase || 0
                })),
              hazardsSpawned: state.hazardsSpawned || 0,
              progress: state.mapProgress,
              logs: state.logs.slice(-6).map((entry) => entry.message)
            })
          )
        : null
  };
}
setupClasses();
setupInput();
resizeCanvas();
// iOS 工具栏收展 / 窗口拖拽会触发 resize 事件风暴，用 rAF 合并到每帧最多一次重建画布。
window.addEventListener("resize", () => scheduleResize());
if (!loadGame()) {
  $("classModal").classList.remove("hidden");
}
requestAnimationFrame(frame);
