// 《一刀999》技能语义纯逻辑（0.3.4）：破甲、冲锋、直线穿透、骨卫召唤与生息法阵。
// 不依赖 DOM 与游戏全局状态，便于单元测试；main.js 只负责把结果写回实体。

import { clamp, distance } from "./util.js";

// 技能数值规则集中定义，方便后续调参与单测复用。
export const SKILL_RULES = {
  // 破甲斩：命中后目标防御 -15%，持续 4 秒。
  armorBreak: { defenseRatio: 0.15, duration: 4 },
  // 震地冲：向目标突进最多 140px，击退目标，并获得 0.2 秒无敌。
  charge: { distance: 140, invulnerable: 0.2, knockback: 56 },
  // 雷矛术（穿透）：沿锁定方向命中直线上的敌人，最多 3 个（含首个目标）。
  pierce: { maxTargets: 3, width: 44 },
  // 召唤骨卫：12 秒实体，按玩家 40% 伤害攻击，自动跟随与索敌。
  summon: { duration: 12, attackRatio: 0.4, cooldown: 0.9, engageRange: 300, followRange: 90, attackGap: 26 },
  // 生息法阵：4 秒内每秒回复 8% 最大生命，离开法阵立即失效。
  healZone: { duration: 4, perSecond: 0.08, radius: 120, tick: 1 }
};

// 破甲状态：命中后把剩余时间刷新到满额，返回新的剩余秒数。
export function applyArmorBreak(target, rules = SKILL_RULES.armorBreak) {
  if (!target) return 0;
  target.armorBreakTimer = Math.max(Number(target.armorBreakTimer) || 0, rules.duration);
  return target.armorBreakTimer;
}

// 破甲倒计时：每帧递减，返回剩余秒数（0 表示已恢复）。
export function tickArmorBreak(target, dt) {
  if (!target?.armorBreakTimer) return 0;
  target.armorBreakTimer = Math.max(0, target.armorBreakTimer - Math.max(0, Number(dt) || 0));
  return target.armorBreakTimer;
}

// 穿透弹道选敌：把敌人投影到 origin→aim 的射线上，取投影距离在 (0, range]、
// 垂线距离不超过 弹道宽度 + 目标半径 的敌人，按命中先后最多 maxTargets 个。
export function pickPierceTargets({
  origin,
  aim,
  entities,
  range,
  width = SKILL_RULES.pierce.width,
  maxTargets = SKILL_RULES.pierce.maxTargets
}) {
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (!length || !(range > 0)) return [];
  const ux = dx / length;
  const uy = dy / length;
  return (entities || [])
    .filter((entity) => entity.alive && !entity.friendly && !entity.npc)
    .map((entity) => {
      const ex = entity.x - origin.x;
      const ey = entity.y - origin.y;
      return {
        entity,
        // 沿射线方向的投影距离与垂直偏移（垂足在射线之外时投影可能为负）。
        projection: ex * ux + ey * uy,
        offset: Math.abs(ex * uy - ey * ux),
        radius: Number(entity.radius) || 0
      };
    })
    .filter((hit) => hit.projection > 0 && hit.projection <= range + hit.radius && hit.offset <= (Number(width) || 0) + hit.radius)
    .sort((a, b) => a.projection - b.projection)
    .slice(0, Math.max(1, Math.floor(Number(maxTargets) || 1)))
    .map((hit) => hit.entity);
}

// 冲锋落点：从 from 朝 to 前进最多 distance 像素，并保留 stopGap 避免穿过目标。
// 返回 { x, y, travel }，travel 为实际位移距离（0 表示原地释放）。
export function resolveChargePoint({ from, to, distance: chargeDistance = SKILL_RULES.charge.distance, stopGap = 18 }) {
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const gap = Math.hypot(dx, dy);
  if (!gap || !(chargeDistance > 0)) return { x: from.x, y: from.y, travel: 0 };
  const targetGap = Math.max(0, gap - Math.max(0, Number(stopGap) || 0));
  const travel = Math.max(0, Math.min(chargeDistance, targetGap));
  return { x: from.x + (dx / gap) * travel, y: from.y + (dy / gap) * travel, travel };
}

// 击退落点：从 origin 指向 target 的方向推开 amount 像素，并按地图边界夹取。
export function resolveKnockback({ origin, target, distance: amount = SKILL_RULES.charge.knockback, bounds }) {
  const dx = Number(target.x) - Number(origin.x);
  const dy = Number(target.y) - Number(origin.y);
  const length = Math.hypot(dx, dy);
  if (!length) return { x: target.x, y: target.y };
  let x = target.x + (dx / length) * amount;
  let y = target.y + (dy / length) * amount;
  if (bounds) {
    x = clamp(x, bounds.minX, bounds.maxX);
    y = clamp(y, bounds.minY, bounds.maxY);
  }
  return { x, y };
}

// 骨卫实体：12 秒召唤物。friendly 标记让它不会被自动索敌 / 怪物攻击 / e2e 当作怪物；
// attack 字段只用于展示，实际伤害按 attackRatio 复用玩家伤害公式（40% 玩家普攻）。
export function createBoneGuard({ player, hero, level = 1, id = "bone-guard", rules = SKILL_RULES.summon }) {
  const maxHp = Math.max(1, Math.round(hero.hp * 0.5));
  return {
    id,
    name: "骨卫",
    level: Math.max(1, Math.floor(Number(level) || 1)),
    x: player.x - 38,
    y: player.y + 30,
    spawnX: player.x - 38,
    spawnY: player.y + 30,
    radius: 13,
    color: "#cfd8cf",
    maxHp,
    hp: maxHp,
    attack: Math.max(1, Math.round(hero.attack * rules.attackRatio)),
    defense: 0,
    exp: 0,
    gold: 0,
    alive: true,
    friendly: true,
    summoned: true,
    aggro: false,
    wander: 0,
    hitFlash: 0,
    attackFlash: 0,
    summonLife: rules.duration,
    attackCooldown: 0
  };
}

// 骨卫索敌：最近的存活敌对目标（排除友军 / 白名玩家），超出 engageRange 时返回 null。
export function pickSummonTarget({ guard, entities, range = SKILL_RULES.summon.engageRange }) {
  return (
    (entities || [])
      .filter((entity) => entity.alive && !entity.friendly && !entity.npc && entity.id !== guard.id)
      .filter((entity) => distance(guard, entity) <= range)
      .sort((a, b) => distance(guard, a) - distance(guard, b))[0] || null
  );
}

// 生息法阵单帧推进：玩家在圈内每 1 秒回复 maxHp × 8%；离开圈立即失效；4 秒后自然结束。
// 返回 { active, left, expired, heal, life, tick }，由 main.js 写回 zone 与玩家生命。
export function advanceHealZone({ zone, player, dt, maxHp, rules = SKILL_RULES.healZone }) {
  const step = Math.max(0, Number(dt) || 0);
  const inside = distance(player, zone) <= (Number(zone.radius) || rules.radius);
  if (!inside) {
    return { active: false, left: true, expired: false, heal: 0, life: Number(zone.life) || 0, tick: Number(zone.tick) || 0 };
  }
  const life = Math.max(0, (Number(zone.life) || 0) - step);
  let tick = (Number(zone.tick) || 0) - step;
  let heal = 0;
  if (tick <= 0) {
    tick += rules.tick;
    heal = Math.max(1, Math.round(Math.max(0, Number(maxHp) || 0) * rules.perSecond));
  }
  return { active: life > 0, left: false, expired: life <= 0, heal, life, tick };
}
