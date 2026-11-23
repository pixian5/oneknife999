// 地图威胁（0.8.80）：把 0.8.79 的目标卡标签接成可执行的轻量环境机制。
// 设计约束：
// - 只在生成图的野外生效，城镇 / 水井 / 篝火等安全区不扣血、不减治疗；
// - 每个威胁只做一件可读的事，不叠加多层随机，避免百图变成“处处是隐藏惩罚”；
// - 本模块只放纯函数与规则，DOM / 音效 / 日志由 main.js 负责，便于单测直接断言。

export const THREAT_RULES = {
  // 矿尘：野外出手精度下降，玩家造成的伤害 -8%。不做随机 miss，避免影响确定性回归。
  dust: { damageMult: 0.92 },
  // 灼热：每 5 秒一次 2% 最大生命的灼烧，只压到 1 HP，不直接致死。
  heat: { interval: 5, hpRatio: 0.02 },
  // 腐雾：药水与生息法阵回复都降到 72%，迫使玩家更谨慎地选择补给时机。
  rot: { potionMult: 0.72, healMult: 0.72 },
  // 雷暴：每 8 秒在玩家脚下生成 1.2 秒预警圈，基础伤害 7% 最大生命，按防御正常减免。
  storm: { interval: 8, radius: 110, hpRatio: 0.07 },
  // 潮汐：每 7 秒冲刷一次，减速 1.6 秒到 65% 移速。
  tide: { interval: 7, duration: 1.6, factor: 0.65 }
};

// 从地图的 threat 元数据创建本场运行时。没有 threat / 未知 id 返回 null。
export function createThreatRuntime(threat) {
  if (!threat || !THREAT_RULES[threat.id]) return null;
  return {
    id: threat.id,
    label: threat.label || threat.id,
    heatTimer: THREAT_RULES.heat.interval,
    stormTimer: THREAT_RULES.storm.interval,
    tideTimer: THREAT_RULES.tide.interval
  };
}

// 矿尘伤害倍率：安全区内不吃惩罚。
export function threatDamageMultiplier(runtime, safe = false) {
  if (!runtime || runtime.id !== "dust" || safe) return 1;
  return THREAT_RULES.dust.damageMult;
}

// 腐雾对药水 / 生息法阵的回复倍率。
export function threatPotionMultiplier(runtime, safe = false) {
  if (!runtime || runtime.id !== "rot" || safe) return 1;
  return THREAT_RULES.rot.potionMult;
}

// 腐雾对生息法阵的回复倍率；安全区内同样不压回复。
export function threatHealMultiplier(runtime, safe = false) {
  if (!runtime || runtime.id !== "rot" || safe) return 1;
  return THREAT_RULES.rot.healMult;
}

// 推进一次威胁计时，返回本帧要结算的事件数组。
// ctx: { safe, maxHp, playerX, playerY }
// - 安全区内不产生伤害 / 减速事件，但计时照常循环，离开安全区后立即进入节奏。
// - heat 的伤害由 main.js 夹到至少 1 HP，storm 走既有危险区结算。
export function advanceThreat(runtime, dt, ctx = {}) {
  const events = [];
  if (!runtime) return events;
  const step = Math.max(0, Number(dt) || 0);
  const safe = Boolean(ctx.safe);
  const maxHp = Math.max(1, Number(ctx.maxHp) || 1);

  if (runtime.id === "heat") {
    runtime.heatTimer -= step;
    if (runtime.heatTimer <= 0) {
      runtime.heatTimer += THREAT_RULES.heat.interval;
      if (!safe) events.push({ kind: "heat", amount: Math.max(1, Math.round(maxHp * THREAT_RULES.heat.hpRatio)) });
    }
  }

  if (runtime.id === "storm") {
    runtime.stormTimer -= step;
    if (runtime.stormTimer <= 0) {
      runtime.stormTimer += THREAT_RULES.storm.interval;
      if (!safe) {
        events.push({
          kind: "storm",
          x: Number(ctx.playerX) || 0,
          y: Number(ctx.playerY) || 0,
          radius: THREAT_RULES.storm.radius,
          damage: Math.max(6, Math.round(maxHp * THREAT_RULES.storm.hpRatio))
        });
      }
    }
  }

  if (runtime.id === "tide") {
    runtime.tideTimer -= step;
    if (runtime.tideTimer <= 0) {
      runtime.tideTimer += THREAT_RULES.tide.interval;
      if (!safe) events.push({ kind: "tide", duration: THREAT_RULES.tide.duration, factor: THREAT_RULES.tide.factor });
    }
  }

  return events;
}
