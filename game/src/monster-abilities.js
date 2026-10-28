// 《一刀999》怪物行为原语（0.6.0 P0）：把 config.js 里 56 种怪物、112 条技能描述
// 落成可执行的行为配置，让「林皮蛛的毒牙」真的中毒、「残甲尸兵的残军意志」真的免疫一次致命伤。
//
// 设计原则：
// - 纯函数 + 注入随机，不依赖 DOM / 全局状态，可直接单测（与 combat.js / skills.js 同风格）；
// - 行为分三类：攻击形态（attack）、被动（passive）、亡语（onDeath），由 main.js 在对应时机调用；
// - 所有行为都可缺省，缺省即「普通怪」（只有基础前摇 + 冷却），保证未配置的怪行为不变。

// ============ 行为原语定义 ============
// 每类原语的语义与参数见下；BEHAVIOR_LIBRARY 是「原语 id → 默认参数」的唯一事实源。

export const ATTACK_SHAPES = {
  normal: { label: "基础近战", multiHit: 1, rangeMult: 1, damageMult: 1 },
  // 多段连击：撕咬 / 连射 / 破军连斩 / 逐浪三斩 / 星骸斩。每段独立结算，总伤按 multiHit 均分。
  multi: { label: "多段连击", multiHit: 2, rangeMult: 1, damageMult: 0.92 },
  multi3: { label: "三段连击", multiHit: 3, rangeMult: 1, damageMult: 0.85 },
  // 蓄力重击：前摇更长、伤害更高、可击退（矿镐重击 / 重锤 / 神陨锤 / 铜棺砸击）。
  heavy: { label: "蓄力重击", multiHit: 1, rangeMult: 1.1, damageMult: 1.35, knockback: 30, windupMult: 1.6 },
  // 远程投掷：在更远距离出手（掷刃 / 投掷火石 / 冰弩 / 猎杀箭 / 雷羽 / 引魂灯 / 断界弹 / 魂火 / 怨火）。
  ranged: { label: "远程投掷", multiHit: 1, rangeMult: 1.9, damageMult: 0.85 },
  // 直线冲锋：向前突进并击退（晶角冲锋 / 魔血冲锋 / 礁壳冲撞 / 残甲冲撞 / 撕裂突进 / 跃袭 / 俯冲）。
  charge: { label: "冲锋", multiHit: 1, rangeMult: 1.45, damageMult: 1.2, knockback: 36, dash: 80 },
  // 范围横扫 / 震击（石戟横扫 / 帝陵戟 / 黄泉戟 / 金甲重踏 / 冰壳震荡）：命中范围更大。
  sweep: { label: "范围横扫", multiHit: 1, rangeMult: 1.7, damageMult: 1.1 },
  // 锁链拖拽：命中把玩家拉近（炼狱行刑者）。
  pull: { label: "锁链拖拽", multiHit: 1, rangeMult: 2.2, damageMult: 0.8 }
};

export const PASSIVE_IDS = {
  // ---- 状态类 ----
  poison: "命中叠加中毒层数（毒牙 / 尾针 / 龙毒 / 腐毒抓 / 熔岩拳灼烧同族）",
  slow: "命中降低玩家移速（蛛网 / 霜牙 / 冻刃 / 潮刃 / 残甲冲撞）",
  stun: "命中有概率打断玩家（尖啸 / 机关拳）",
  // ---- 防御类 ----
  shieldCycle: "周期获得护盾（寒甲 / 协议护盾 / 堕神甲）",
  firstHitReduce: "首次受到伤害降低（尸甲 / 无形 / 鳞光）",
  lowHpReduce: "低血量时受到伤害降低（冰躯 / 守碑姿态）",
  meleeReflect: "近战命中者受到反伤（铜甲反震 / 炉渣护体）",
  lethalSave: "首次致命伤保留少量生命（残军意志）",
  // ---- 成长类 ----
  enrageLowHp: "玩家低血时增伤 / 加速（嗜血追踪 / 血腥嗅觉 / 处决）",
  packHunt: "附近同类越多伤害越高（雪线围猎 / 群猎撕咬 / 战忆 / 死者护佑）",
  rageStack: "命中后叠加攻速（修罗怒）",
  lowHpDamageUp: "自身生命越低伤害越高（不灭斩）",
  // ---- 亡语类 ----
  deathPoison: "死亡时留下毒区（孢子爆裂）",
  deathRevive: "死亡后短暂复原一次（残星复起）",
  // ---- 干扰类 ----
  blind: "短暂降低玩家命中 / 隐藏自身轮廓（无名雾 / 雪隐）",
  resourceDrain: "降低玩家资源回复（潮歌 / 摄魂）",
  potionLock: "短暂禁止药水回复（名册封锁）",
  skillLock: "短暂封锁玩家技能冷却（镇国符）"
};

// ============ 行为表：怪物基础名 → 行为配置 ============
// 键为 MONSTER_BEHAVIORS 里的基础名（不带章节前缀）；chapter-prefixed 名字由 attachBehaviors 用 suffix 匹配。
// attack 缺省 normal；passives 为空数组。数值均为原型阶段的手工调参，可被 docs/11 基线覆盖。
export const MONSTER_ABILITIES = {
  // ---------- 第 1 章 灰烬村外（4 只手工图怪）----------
  腐烬矿工: { attack: "heavy", passives: [] },
  赤牙猎犬: { attack: "multi", passives: ["enrageLowHp"] },
  裂脊尸卫: { attack: "charge", passives: ["firstHitReduce"] },
  灰烬侦察者: { attack: "ranged", passives: ["packHunt"] },

  // ---------- 第 2 章 雾松林 ----------
  灰鬃狼: { attack: "charge", passives: ["packHunt"] },
  林皮蛛: { attack: "normal", passives: ["poison", "slow"] },
  松鸦盗: { attack: "ranged", passives: ["firstHitReduce"] },
  枯木菇人: { attack: "normal", passives: ["lowHpReduce"], onDeath: "deathPoison" },

  // ---------- 第 3 章 黑石矿脉 ----------
  黑岩矿工: { attack: "heavy", passives: [] },
  落石魔: { attack: "heavy", passives: ["lowHpReduce"] },
  矿脉蝙蝠: { attack: "charge", passives: ["stun"] },
  腐毒僵尸: { attack: "normal", passives: ["poison", "resourceDrain"] },

  // ---------- 第 4 章 赤砂大漠 ----------
  赤砂蝎: { attack: "normal", passives: ["poison"] },
  沙虫: { attack: "charge", passives: ["firstHitReduce"] },
  沙盗斥候: { attack: "multi3", passives: [] },
  枯骨游魂: { attack: "ranged", passives: ["firstHitReduce"] },

  // ---------- 第 5 章 边境遗烬（生成图 4 只）----------
  腐烬战奴: { attack: "heavy", passives: ["lowHpReduce"] },
  赤牙猎兽: { attack: "charge", passives: ["enrageLowHp"] },
  残甲尸兵: { attack: "heavy", passives: ["lethalSave"] },
  荒道斥候: { attack: "ranged", passives: ["packHunt"] },

  // ---------- 第 6 章 苍月潮境 ----------
  潮骨水鬼: { attack: "sweep", passives: ["slow"] },
  蓝鳞海妖: { attack: "normal", passives: ["resourceDrain", "firstHitReduce"] },
  礁甲兽: { attack: "charge", passives: ["firstHitReduce"] },
  逐浪刀客: { attack: "multi3", passives: [] },

  // ---------- 第 7 章 龙脉地宫 ----------
  石俑卫: { attack: "sweep", passives: [] },
  龙脉毒虫: { attack: "normal", passives: ["poison"] },
  铜甲尸: { attack: "heavy", passives: ["meleeReflect"] },
  寻宝恶徒: { attack: "ranged", passives: ["packHunt"] },

  // ---------- 第 8 章 冰封停时 ----------
  霜牙狼: { attack: "charge", passives: ["slow", "packHunt"] },
  冻尸兵: { attack: "normal", passives: ["slow", "lowHpReduce"] },
  冰壳魔: { attack: "sweep", passives: ["shieldCycle"] },
  雪原猎手: { attack: "ranged", passives: ["blind"] },

  // ---------- 第 9 章 烬火魔域 ----------
  熔岩奴: { attack: "heavy", passives: ["poison", "meleeReflect"] },
  火翼魔: { attack: "charge", passives: ["packHunt"] },
  焦骨卫: { attack: "heavy", passives: ["lowHpDamageUp"] },
  炼狱行刑者: { attack: "pull", passives: ["lowHpDamageUp"] },

  // ---------- 第 10 章 幽冥河 ----------
  摄魂鬼: { attack: "ranged", passives: ["blind", "resourceDrain"] },
  冥甲尸: { attack: "heavy", passives: ["poison", "packHunt"] },
  渡魂妖: { attack: "ranged", passives: [] },
  黄泉守卫: { attack: "sweep", passives: ["potionLock"] },

  // ---------- 第 11 章 天穹遗迹（注：主线 10 章，第 11~ 章为无尽深层预留，见 maps.js CHAPTERS）----------
  遗迹傀儡: { attack: "heavy", passives: ["shieldCycle", "stun"] },
  雷羽妖: { attack: "ranged", passives: [] },
  巡天卫: { attack: "normal", passives: ["packHunt"] },
  断界法师: { attack: "ranged", passives: [] },

  // ---------- 第 12 章 星陨废墟 ----------
  陨晶兽: { attack: "charge", passives: ["lowHpReduce"] },
  虚空影: { attack: "normal", passives: ["blind"] },
  星骸兵: { attack: "multi3", passives: [], onDeath: "deathRevive" },
  禁区猎杀者: { attack: "ranged", passives: ["enrageLowHp"] },

  // ---------- 第 13 章 神魔战场 ----------
  堕神卫: { attack: "heavy", passives: ["shieldCycle"] },
  战场怨魂: { attack: "ranged", passives: ["packHunt"] },
  破军修罗: { attack: "multi3", passives: ["rageStack"] },
  魔血骑: { attack: "charge", passives: ["lowHpDamageUp"] },

  // ---------- 第 14 章 帝陵终境（终章怪）----------
  禁卫: { attack: "sweep", passives: [] },
  金甲尸王: { attack: "heavy", passives: [] },
  镇国妖师: { attack: "ranged", passives: ["skillLock"] },
  不灭战魂: { attack: "heavy", passives: ["lowHpDamageUp"] },

  // ============ 0.6.0 新增 50 种野怪（对应 monster-full-{名}-{idle|walk|attack|hit}.png 四动作帧）============
  // 第 1 章 边境
  荒原战狼: { attack: "charge", passives: ["packHunt"] },
  断刃老兵: { attack: "heavy", passives: ["lethalSave"] },
  铁屑蜥蜴: { attack: "normal", passives: ["firstHitReduce"] },
  铁锈傀儡: { attack: "heavy", passives: ["lowHpReduce"] },
  焦土鸦王: { attack: "ranged", passives: ["packHunt"] },
  // 第 2 章 苍月
  苍月鲨卫: { attack: "charge", passives: ["enrageLowHp"] },
  礁岩魔龟: { attack: "normal", passives: ["meleeReflect"] },
  沉渊海灵: { attack: "ranged", passives: ["resourceDrain"] },
  深海巨章: { attack: "pull", passives: ["slow"] },
  冰鳞鱼人: { attack: "normal", passives: ["slow"] },
  // 第 3 章 龙脉
  矿道巨虫: { attack: "charge", passives: ["poison"] },
  矿毒邪蛛: { attack: "normal", passives: ["poison", "slow"] },
  石甲巨像: { attack: "sweep", passives: ["firstHitReduce"] },
  沙魂亡灵: { attack: "ranged", passives: ["blind"] },
  地宫炎蝠: { attack: "charge", passives: ["stun"] },
  // 第 4 章 冰封
  寒霜狼卫: { attack: "charge", passives: ["slow", "packHunt"] },
  极地魔狼: { attack: "multi", passives: ["packHunt"] },
  暴雪鹰王: { attack: "ranged", passives: ["blind"] },
  冰川巨兽: { attack: "heavy", passives: ["shieldCycle"] },
  霜苔毒蛙: { attack: "normal", passives: ["poison"] },
  // 第 5 章 烬火
  火焰战狼: { attack: "charge", passives: ["enrageLowHp"] },
  烬甲巨虫: { attack: "heavy", passives: ["meleeReflect"] },
  热浪妖: { attack: "sweep", passives: ["poison"] },
  烬焰巫侍: { attack: "ranged", passives: ["skillLock"] },
  熔岩蚁后: { attack: "normal", passives: ["packHunt"] },
  // 第 6 章 幽冥
  幽冥骑士: { attack: "charge", passives: ["lowHpDamageUp"] },
  白骨射手: { attack: "ranged", passives: [] },
  鬼火妖灵: { attack: "ranged", passives: ["resourceDrain"] },
  噬魂将军: { attack: "sweep", passives: ["potionLock"] },
  幽冥鬼鸮: { attack: "ranged", passives: ["blind"] },
  // 第 7 章 天穹
  残破巨像: { attack: "heavy", passives: ["lowHpReduce"] },
  祭坛邪灵: { attack: "ranged", passives: ["skillLock"] },
  雾隐蛟: { attack: "charge", passives: ["blind"] },
  迷雾妖鸟: { attack: "ranged", passives: [] },
  林间鬼鸮: { attack: "ranged", passives: ["stun"] },
  // 第 8 章 星陨
  灰烬影狼: { attack: "charge", passives: ["packHunt", "blind"] },
  灰烬魔影: { attack: "normal", passives: ["blind"] },
  黑曜石灵: { attack: "heavy", passives: ["shieldCycle"] },
  灼心魔蝠: { attack: "charge", passives: ["stun"] },
  焦焰飞龙: { attack: "sweep", passives: ["poison"] },
  // 第 9 章 神魔
  熔核巨人: { attack: "heavy", passives: ["meleeReflect"] },
  火狱邪龙: { attack: "sweep", passives: ["poison"] },
  熔岩蛇王: { attack: "multi3", passives: ["poison"] },
  虚影刺客: { attack: "normal", passives: ["enrageLowHp", "blind"] },
  灰烬魔像: { attack: "heavy", passives: ["shieldCycle"] },
  // 第 10 章 帝陵
  玉髓守卫: { attack: "sweep", passives: ["shieldCycle"] },
  藤蔓缚妖: { attack: "pull", passives: ["slow"] },
  苔冠树精: { attack: "normal", passives: ["lowHpReduce"], onDeath: "deathPoison" },
  金纹毒蟒: { attack: "multi", passives: ["poison"] },
  沙丘巨蟒: { attack: "pull", passives: ["poison"] }
};

// 被动参数（默认值集中在这里，个别怪可在 MONSTER_ABILITIES 里用 passives 覆盖参数对象）。
export const PASSIVE_PARAMS = {
  poison: { stacks: 1, chance: 0.35 },
  slow: { duration: 1.6, factor: 0.68, chance: 0.4 },
  stun: { duration: 0.5, chance: 0.25 },
  shieldCycle: { cooldown: 8, amount: 0.3 },
  firstHitReduce: { ratio: 0.35 },
  lowHpReduce: { threshold: 0.35, ratio: 0.3 },
  meleeReflect: { ratio: 0.18 },
  lethalSave: { hpRatio: 0.12 },
  enrageLowHp: { threshold: 0.35, damageBonus: 0.2, speedBonus: 0.2 },
  packHunt: { perAlly: 0.08, max: 0.35, range: 260 },
  rageStack: { attackSpeedPerStack: 0.08, max: 5 },
  lowHpDamageUp: { maxBonus: 1.0 },
  deathPoison: { radius: 90, damage: 8, duration: 4 },
  deathRevive: { hpRatio: 0.3 },
  blind: { duration: 2, missChance: 0.3 },
  resourceDrain: { ratio: 0.4, duration: 3 },
  potionLock: { duration: 3 },
  skillLock: { duration: 2 }
};

// ============ 纯函数：行为查询与结算 ============

// 按实体名解析行为（suffix 匹配，兼容 `冰封冰壳魔` 这类章节前缀命名）。
// 返回 { attack, passives: [{ id, params }], onDeath }；无配置返回普通怪默认。
export function resolveAbilities(monsterName, library = MONSTER_ABILITIES, params = PASSIVE_PARAMS) {
  const base = Object.keys(library).find((key) => monsterName === key || monsterName.endsWith(key));
  const entry = (base && library[base]) || { attack: "normal", passives: [] };
  const passives = (entry.passives || []).map((item) => {
    // 被动既可用字符串（取默认参数），也可用 { id, ...覆盖 } 指定参数。
    const id = typeof item === "string" ? item : item?.id;
    const override = typeof item === "object" ? item : {};
    return { id, params: { ...(params[id] || {}), ...override } };
  });
  return { base, attack: ATTACK_SHAPES[entry.attack] ? entry.attack : "normal", passives, onDeath: entry.onDeath || null };
}

// 攻击形态 → 实际结算参数（含怪物自身等级、生命比等动态修正）。
// 返回 { multiHit, rangeMult, damageMult, knockback, dash, windupMult, pulls }。
export function attackShapeConfig(shapeId, { hpRatio = 1, rageStacks = 0 } = {}) {
  const shape = ATTACK_SHAPES[shapeId] || ATTACK_SHAPES.normal;
  return {
    multiHit: Math.max(1, Math.floor(shape.multiHit || 1)),
    rangeMult: Number(shape.rangeMult) || 1,
    damageMult: (Number(shape.damageMult) || 1) * (1 + rageStacks * PASSIVE_PARAMS.rageStack.attackSpeedPerStack),
    knockback: Number(shape.knockback) || 0,
    dash: Number(shape.dash) || 0,
    windupMult: Number(shape.windupMult) || 1,
    pulls: shapeId === "pull",
    hpRatio
  };
}

// 被动判定：命中玩家后是否触发某个被动。返回 { triggered, params }。
export function rollPassive(passives, id, random = Math.random) {
  const entry = (passives || []).find((passive) => passive.id === id);
  if (!entry) return { triggered: false, params: null };
  const chance = entry.params?.chance;
  if (chance === undefined) return { triggered: true, params: entry.params };
  return { triggered: random() < chance, params: entry.params };
}

// 承伤修正：把怪物的防御类被动叠加到一次受到的伤害上。
// ctx: { hpRatio, firstHit, distance, allies }
// 返回 { damage, consumed }；consumed 标记本次消耗掉的「一次性」被动（首击减伤 / 致命保留）。
export function applyDefensePassives({ passives, damage, ctx = {}, random = Math.random }) {
  let result = Math.max(1, Math.round(damage));
  const consumed = [];
  for (const passive of passives || []) {
    const { id, params } = passive;
    if (id === "firstHitReduce" && ctx.firstHit) {
      result = Math.max(1, Math.round(result * (1 - (params.ratio ?? 0.5))));
      consumed.push(id);
    } else if (id === "lowHpReduce" && ctx.hpRatio !== undefined && ctx.hpRatio <= (params.threshold ?? 0.35)) {
      result = Math.max(1, Math.round(result * (1 - (params.ratio ?? 0.3))));
    } else if (id === "meleeReflect" && ctx.melee) {
      // 反伤不在这里扣玩家血（由调用方读取 reflect 值结算），只标记。
      continue;
    }
  }
  return { damage: result, consumed };
}

// 反伤数值（近战命中带 meleeReflect 的怪物时，玩家受到的反伤）。
export function reflectDamage(passives, damage) {
  const entry = (passives || []).find((passive) => passive.id === "meleeReflect");
  if (!entry) return 0;
  return Math.max(0, Math.round(damage * (entry.params.ratio ?? 0.25)));
}

// 致命伤保留：伤害足以致死时，若带 lethalSave 且未用过，保留 hpRatio 生命并标记消耗。
// 返回 { hp, saved }。
export function resolveLethalSave({ passives, hp, damage, usedLethalSave }) {
  const entry = (passives || []).find((passive) => passive.id === "lethalSave");
  if (!entry || usedLethalSave) return { hp: Math.max(0, hp - damage), saved: false };
  if (damage < hp) return { hp: hp - damage, saved: false };
  const floor = Math.max(1, Math.round((entry.params?.hpRatio ?? 0.12) * 100));
  return { hp: floor, saved: true };
}

// 同类增伤：附近同类怪物数量 → 伤害倍率（packHunt）。
export function packHuntMultiplier(passives, allyCount) {
  const entry = (passives || []).find((passive) => passive.id === "packHunt");
  if (!entry) return 1;
  const perAlly = entry.params?.perAlly ?? 0.12;
  const max = entry.params?.max ?? 0.5;
  return 1 + Math.min(max, Math.max(0, allyCount) * perAlly);
}

// 生命越低伤害越高（lowHpDamageUp / enrageLowHp 的自身版本）：hpRatio 1 → 无加成，0 → maxBonus。
export function lowHpDamageMultiplier(passives, hpRatio) {
  const entry = (passives || []).find((passive) => passive.id === "lowHpDamageUp");
  if (!entry) return 1;
  const maxBonus = entry.params?.maxBonus ?? 1.0;
  return 1 + maxBonus * (1 - Math.max(0, Math.min(1, hpRatio)));
}

// 玩家低血时怪物增伤（enrageLowHp）：玩家 hpRatio 越低，伤害越高。
export function enrageMultiplier(passives, playerHpRatio) {
  const entry = (passives || []).find((passive) => passive.id === "enrageLowHp");
  if (!entry) return 1;
  const threshold = entry.params?.threshold ?? 0.4;
  if (playerHpRatio > threshold) return 1;
  return 1 + (entry.params?.damageBonus ?? 0.3);
}

// 亡语效果：把死亡事件转成场景效果（毒区 / 复原 / 无事发生）。
// 返回 { hazard?, revive? }，由 main.js 写回 state。
export function resolveOnDeath(onDeathId, { entity, params = PASSIVE_PARAMS }) {
  if (onDeathId === "deathPoison") {
    const p = params.deathPoison;
    return {
      hazard: { x: entity.x, y: entity.y, r: p.radius, damage: p.damage, life: 1.2, snap: false, fade: 0.5, attackerLevel: entity.level }
    };
  }
  if (onDeathId === "deathRevive") {
    return { revive: { hpRatio: params.deathRevive.hpRatio } };
  }
  return {};
}
