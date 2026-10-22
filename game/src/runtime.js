import { CLASSES, EQUIPMENT_SLOT_KEYS, equipmentHpBonus, equipmentDefenseBonus } from "./config.js";
import { MAPS, MAP_ORDER, MAP_CLEAR_RULES } from "./maps.js";
import { clamp, distance } from "./util.js";

// 《一刀999》运行时状态容器：集中存放跨模块共享的可变引用。
// state / moveTarget 必须通过 setState / setMoveTarget 更新。

export let state = null;

// 打击感瞬时状态（0.3.3）：连击、屏幕震动、升级闪光。仅存在于内存，不写入存档。
export const fx = { combo: 0, comboTimer: 0, shake: 0, shakePower: 0, levelUp: 0 };

export function resetFx() {
  fx.combo = 0;
  fx.comboTimer = 0;
  fx.shake = 0;
  fx.shakePower = 0;
  fx.levelUp = 0;
}

// 只允许通过 setState 替换整个状态对象；state 内部字段仍可原位修改。
export function setState(next) {
  state = next;
  // 新档 / 读档 / 重置时清空瞬时反馈，避免上一局的连击与震屏残留。
  resetFx();
}

export const keys = {};
export const pointer = { x: 0, y: 0, down: false };

// 虚拟摇杆状态：x / y 为归一化方向（[-1, 1]），active 表示当前有手指或鼠标按住。
export const joystick = { x: 0, y: 0, active: false };

// 键位捕获状态：设置面板点击某个动作后进入等待按键，此时其余游戏快捷键全部屏蔽。
export const keybindCapture = { action: null };

export let moveTarget = null;
export function setMoveTarget(value) {
  moveTarget = value;
}

export function activeMap() {
  return MAPS[state.currentMapId];
}
export function activeHero() {
  return CLASSES[state.classId];
}

export function createState(classId) {
  const hero = CLASSES[classId];
  return {
    classId,
    currentMapId: "ash_outskirts",
    player: {
      x: 480,
      y: 780,
      hp: hero.hp,
      resource: hero.resource * 0.68,
      level: 1,
      exp: 0,
      nextExp: 100,
      gold: 40,
      marks: 0,
      charge: 0,
      potion: 3,
      kills: 0,
      totalKills: 0,
      deaths: 0,
      oneMomentUsed: false,
      attackTimer: 0,
      invulnerable: 0,
      cooldowns: [0, 0, 0, 0],
      targetId: null,
      previewSkill: null,
      skillPoints: 0,
      skillLevels: [0, 0, 0, 0],
      sin: 0,
      equipment: Object.fromEntries(EQUIPMENT_SLOT_KEYS.map((slotKey) => [slotKey, null])),
      poison: 0,
      visitedMaps: { ash_outskirts: true }
    },
    entities: [],
    drops: [],
    particles: [],
    texts: [],
    logs: [],
    startedAt: Date.now(),
    quest: { kills: 0, need: 8, completed: false },
    mapProgress: {},
    hazards: [],
    hazardsSpawned: 0,
    hoveredEntityId: null
  };
}

export function mapProgress(mapId = state.currentMapId) {
  const rule = MAP_CLEAR_RULES[mapId];
  state.mapProgress ||= {};
  state.mapProgress[mapId] ||= {
    kills: 0,
    need: rule.kills,
    bossDefeated: false,
    completed: false,
    rewardClaimed: false,
    completionAnnounced: false,
    resourceClaimed: false,
    siteClaimed: false
  };
  const progress = state.mapProgress[mapId];
  progress.need = rule.kills;
  progress.kills = clamp(Number(progress.kills) || 0, 0, rule.kills);
  progress.bossDefeated = Boolean(progress.bossDefeated);
  progress.completed = progress.kills >= rule.kills && progress.bossDefeated;
  progress.resourceClaimed = Boolean(progress.resourceClaimed);
  progress.siteClaimed = Boolean(progress.siteClaimed);
  return progress;
}

export function isForwardExit(exit, mapId = state.currentMapId) {
  return MAP_ORDER.indexOf(exit.target) > MAP_ORDER.indexOf(mapId);
}

// 任务链状态机（原型 v2）：两级状态——关级三态 + 章级进度，全部由 mapProgress 派生，不新增存档字段。
// 关级三态：available（未到达，非当前关且未完成）/ active（当前关进行中）/ completed（已通关，
// 奖励在 checkMapCompletion 通关时自动发放：60 金币 + 8 首领印记，故 completed 已含 claimed）。
export function questStatus(mapId = state.currentMapId) {
  const progress = state.mapProgress?.[mapId];
  if (!progress || !progress.completed) {
    return { status: mapId === state.currentMapId ? "active" : "available", completed: false };
  }
  return { status: "completed", completed: true, rewardClaimed: Boolean(progress.rewardClaimed) };
}

// 章级进度：当前章 10 关的完成统计（用于任务链标题进度与章末承接展示）。
export function chapterStats(chapterIndex = Math.floor(MAP_ORDER.indexOf(state.currentMapId) / 10)) {
  const first = chapterIndex * 10;
  const ids = MAP_ORDER.slice(first, first + 10);
  const done = ids.filter((id) => state.mapProgress?.[id]?.completed).length;
  return { chapterIndex, ids, done, total: ids.length, complete: done >= ids.length };
}

export function primaryExit() {
  const map = activeMap();
  return map.exits.find((exit) => isForwardExit(exit)) || null;
}

// 装备生命加成：12 部位固定值 + 生命词缀（公式见 config.js）。
export function equipmentHp() {
  return EQUIPMENT_SLOT_KEYS.reduce((sum, slotKey) => sum + equipmentHpBonus(state.player.equipment?.[slotKey], slotKey), 0);
}

// 装备防御加成：防御词缀之和，供承伤公式使用。
export function equipmentDefense() {
  return EQUIPMENT_SLOT_KEYS.reduce((sum, slotKey) => sum + equipmentDefenseBonus(state.player.equipment?.[slotKey]), 0);
}

export function playerMaxHp() {
  return activeHero().hp + state.player.level * 18 + equipmentHp();
}

// 是否红名（docs/05：罪恶值 ≥ 300）。
export function isRedName() {
  return (state.player.sin || 0) >= 300;
}

export function nearWaterWell() {
  const map = activeMap();
  return (
    map.id === "red_sand_desert" && map.landmarks.some((landmark) => landmark.type === "well" && distance(state.player, landmark) < 70)
  );
}

export function nearRestPoint() {
  return (activeMap().tacticalPoints || []).some((point) => point.kind === "rest" && distance(state.player, point) < point.radius);
}

export function nearTown() {
  const town = activeMap().townRect;
  return Boolean(
    town &&
    state.player.x >= town.x + 28 &&
    state.player.x <= town.x + town.w - 28 &&
    state.player.y >= town.y + 28 &&
    state.player.y <= town.y + town.h - 28
  );
}
