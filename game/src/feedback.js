import { distance } from "./util.js";

// 《一刀999》打击感与目标指引的纯逻辑：连击计时、连击奖励、指引目标选择。
// 不依赖 DOM 与游戏全局状态，随机数/时间由调用方注入，便于单元测试。

// 连击规则（0.3.3）：3 秒内连续击杀累计连击；每 5 连击额外奖励金币（不改经验曲线，避免影响百图 e2e 成长断言）。
export const COMBO_RULES = {
  window: 3,
  bonusEvery: 5,
  bonusGold: 8,
  max: 99
};

// 连击计时推进：倒计时结束则清零。返回 { count, timer, expired }。
export function advanceCombo(combo, dt, rules = COMBO_RULES) {
  const count = Math.max(0, Math.floor(Number(combo?.count) || 0));
  const timer = Math.max(0, (Number(combo?.timer) || 0) - Math.max(0, Number(dt) || 0));
  if (count > 0 && timer <= 0) return { count: 0, timer: 0, expired: true };
  return { count, timer, expired: false };
}

// 登记一次击杀：连击 +1 并重置计时；达到每 5 连击的里程碑时返回金币奖励。
// 返回 { count, timer, milestone, bonusGold }。
export function registerComboKill(combo, rules = COMBO_RULES) {
  const count = Math.min(rules.max, Math.max(0, Math.floor(Number(combo?.count) || 0)) + 1);
  const milestone = count > 0 && count % rules.bonusEvery === 0;
  return { count, timer: rules.window, milestone, bonusGold: milestone ? rules.bonusGold : 0 };
}

// 指引目标：按关卡三阶段返回玩家当前最该去的位置。
//   kills 未完成 → 最近的普通怪（没有存活普通怪时退回首领）
//   boss 未击破  → 首领实体；首领正在复活时退回首领固定坐标
//   completed    → 前进出口
// 返回 { kind, target, label, color }；target 需提供 x / y / name。
export function resolveGuideTarget({ player, entities, progress, boss, forwardExit }) {
  const list = entities || [];
  // 召唤物是友军：指引箭头不应指向骨卫。
  const alive = list.filter((entity) => entity.alive && !entity.npc && !entity.friendly);
  const nearestMob = () => {
    const mobs = alive.filter((entity) => !entity.boss);
    return mobs.sort((a, b) => distance(player, a) - distance(player, b))[0] || null;
  };
  if (progress && !progress.completed && progress.kills < progress.need) {
    const mob = nearestMob();
    if (mob) return { kind: "kills", target: mob, label: `清剿 ${progress.kills}/${progress.need}`, color: "#8fc7a2" };
  }
  if (progress && !progress.completed) {
    const bossEntity = alive.find((entity) => entity.boss) || (boss ? { ...boss, alive: true } : null);
    if (bossEntity) return { kind: "boss", target: bossEntity, label: `首领 ${bossEntity.name}`, color: "#f16d66" };
  }
  if (forwardExit) return { kind: "exit", target: forwardExit, label: `前往 ${forwardExit.label || "出口"}`, color: "#e7b36b" };
  return null;
}
