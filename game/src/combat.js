// 《一刀999》战斗结算纯逻辑：伤害计算与击杀收益。
// 不依赖 DOM 与游戏全局状态，随机数由参数注入，便于单元测试与未来服务端共享。
import { effectiveItemPower } from "./config.js";

// 计算一次攻击的伤害。
// target 需提供 defense/maxHp/boss；player 需提供 level/charge/equipment；hero 为职业配置。
// 返回 { damage, critical, chargeGain }：伤害、是否触发满破势爆发、本次应积累的破势值。
// 装备战力按有效值计入（基础 power + 强化加成 + 攻击词缀，见 config.js effectiveItemPower）。
export function computeDamage({ target, hero, player, multiplier, kind, fastForward = false, random = Math.random }) {
  const weaponPower = Object.values(player.equipment || {}).reduce((sum, item) => sum + effectiveItemPower(item), 0);
  const base = hero.attack + player.level * 4 + weaponPower * 0.9;
  const variance = random() * 0.2 + 0.9;
  const defense = target.defense || 0;
  const reduction = defense / (defense + 100 + player.level * 5);
  let damage = Math.max(1, Math.round(base * multiplier * variance * (1 - reduction)));
  // 满破势时爆发类技能获得额外 1.55 倍结算（一刀时刻会先清空破势槽，因此不叠加）。
  const critical = kind === "爆发" && player.charge >= 100;
  if (critical) damage = Math.round(damage * 1.55);
  if (fastForward) damage *= 25;
  // 首领单次受击上限，避免高倍率技能跳过阶段战设计。
  if (target.boss) damage = Math.min(damage, Math.ceil(target.maxHp * (fastForward ? 0.18 : 0.035)));
  return { damage, critical, chargeGain: target.boss ? 7 : 10 };
}

// 计算玩家承伤：公式与 docs/11 数值基线一致（输入输出同一公式）。
// 减免 = 防御 / (防御 + 100 + 攻击者等级 × 5)；attackerLevel 缺省按 1 处理。
export function computeIncomingDamage({ attack, attackerLevel = 1, defense }) {
  const reduction = defense / (defense + 100 + Math.max(0, attackerLevel) * 5);
  return Math.max(1, Math.round(attack * (1 - reduction)));
}

// 计算击杀收益：经验、首领印记、破势与职业资源回复比例。
// quest 为当前关卡进度快照（kills/need/bossDefeated），rule 为 MAP_CLEAR_RULES 条目。
// 经验规则（0.3.2）：
// - 首轮进度击杀给满额经验；清完目标后继续刷怪按 50% 给经验，避免「打半天毫无成长感」。
// - 普通怪按 100 经验 / 本关目标数折算并向上取整：第 1 关 8 只怪即可在见到首领前升到 2 级。
// - 首领重复击杀同样给 50%，升级上限由调用方按关卡曲线封顶，不会无限刷级。
export function computeKillReward({ target, quest, rule }) {
  const firstProgressKill = target.boss ? !quest.bossDefeated : quest.kills < quest.need;
  const baseExp = target.boss
    ? Math.max(1, Math.round(30 / rule.mapsPerLevel))
    : Math.max(1, Math.ceil(100 / rule.mapsPerLevel / rule.kills));
  const expGain = firstProgressKill ? baseExp : Math.max(1, Math.round(baseExp * 0.5));
  return {
    firstProgressKill,
    expGain,
    marksGain: target.boss ? 35 : 0,
    chargeGain: target.boss ? 32 : 12,
    resourceGainRatio: 0.08
  };
}

// 结算一次经验获得：可连续升级，但不超过 levelCap（本关上限）。
// 返回 { level, exp, nextExp, levelsGained }；达到上限后经验停在满格，避免进度条溢出或倒扣。
export function applyExperience({ level = 1, exp = 0, nextExp = 100, expGain = 0, levelCap = Number.MAX_SAFE_INTEGER }) {
  const need = Math.max(1, Math.floor(Number(nextExp) || 100));
  const cap = Math.max(0, Math.floor(Number(levelCap) || 0));
  let nextLevel = Math.max(0, Math.floor(Number(level) || 0));
  let currentExp = Math.max(0, Number(exp) || 0) + Math.max(0, Math.floor(Number(expGain) || 0));
  let levelsGained = 0;
  while (currentExp >= need && nextLevel < cap) {
    currentExp -= need;
    nextLevel += 1;
    levelsGained += 1;
  }
  // 已到本关上限：经验最多显示到满格，剩余溢出经验丢弃（通关时由主线曲线接管）。
  if (nextLevel >= cap) currentExp = Math.min(currentExp, need);
  return { level: nextLevel, exp: currentExp, nextExp: need, levelsGained };
}
