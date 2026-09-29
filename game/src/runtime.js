import { CLASSES } from "./config.js";
import { MAPS, MAP_ORDER, MAP_CLEAR_RULES } from "./maps.js";
import { clamp, distance } from "./util.js";

// 《一刀999》运行时状态容器：集中存放跨模块共享的可变引用。
// state / moveTarget 必须通过 setState / setMoveTarget 更新。

export let state = null;

// 只允许通过 setState 替换整个状态对象；state 内部字段仍可原位修改。
export function setState(next) {
  state = next;
}

export const keys = {};
export const pointer = { x: 0, y: 0, down: false };

// 虚拟摇杆状态：x / y 为归一化方向（[-1, 1]），active 表示当前有手指或鼠标按住。
export const joystick = { x: 0, y: 0, active: false };

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
      oneMomentUsed: false,
      attackTimer: 0,
      invulnerable: 0,
      cooldowns: [0, 0, 0, 0],
      targetId: null,
      previewSkill: null,
      equipment: { weapon: null, neck: null, boots: null },
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

export function primaryExit() {
  const map = activeMap();
  return map.exits.find((exit) => isForwardExit(exit)) || null;
}

export function equipmentHp() {
  return Object.values(state.player.equipment).reduce((sum, item) => sum + (item?.slot === "neck" ? 45 : 0), 0);
}

export function playerMaxHp() {
  return activeHero().hp + state.player.level * 18 + equipmentHp();
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
