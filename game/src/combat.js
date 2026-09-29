// 《一刀999》战斗结算纯逻辑：伤害计算与击杀收益。
// 不依赖 DOM 与游戏全局状态，随机数由参数注入，便于单元测试与未来服务端共享。

// 计算一次攻击的伤害。
// target 需提供 defense/maxHp/boss；player 需提供 level/charge/equipment；hero 为职业配置。
// 返回 { damage, critical, chargeGain }：伤害、是否触发满破势爆发、本次应积累的破势值。
export function computeDamage({ target, hero, player, multiplier, kind, fastForward = false, random = Math.random }) {
  const weaponPower = Object.values(player.equipment || {}).reduce((sum, item) => sum + (item?.power || 0), 0);
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

// 计算击杀收益：经验、首领印记、破势与职业资源回复比例。
// quest 为当前关卡进度快照（kills/need/bossDefeated），rule 为 MAP_CLEAR_RULES 条目。
export function computeKillReward({ target, quest, rule }) {
  const firstProgressKill = target.boss ? !quest.bossDefeated : quest.kills < quest.need;
  const expGain = firstProgressKill
    ? target.boss
      ? Math.round(30 / rule.mapsPerLevel)
      : Math.max(1, Math.floor(70 / rule.mapsPerLevel / rule.kills))
    : 0;
  return {
    firstProgressKill,
    expGain,
    marksGain: target.boss ? 35 : 0,
    chargeGain: target.boss ? 32 : 12,
    resourceGainRatio: 0.08
  };
}
