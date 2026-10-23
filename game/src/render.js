import {
  monsterProfile,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_KEYS,
  effectiveItemPower,
  SKILL_UPGRADE,
  PK_RULES,
  QUEST_REWARD
} from "./config.js";
import { MAPS, MAP_ORDER, MAP_CLEAR_RULES, campaignGrowth } from "./maps.js";
import { routePoint } from "./geometry.js";
import { $, clamp, rand, formatNumber, distance } from "./util.js";
import { KEYBIND_ACTIONS, keyLabel } from "./keybinds.js";
import { SHOP_GOODS, reforgeQuote } from "./shop.js";
import {
  state,
  moveTarget,
  activeMap,
  activeHero,
  mapProgress,
  playerMaxHp,
  isForwardExit,
  questStatus,
  chapterStats,
  keybindCapture,
  fx
} from "./runtime.js";
import { COMBO_RULES, resolveGuideTarget } from "./feedback.js";

// 《一刀999》渲染层：Canvas 世界绘制、右侧 HUD 的 DOM 渲染与屏幕反馈。

export const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const wrap = document.querySelector("#canvasWrap");

let dpr = 1;

let toastTimer = null;

let skillSkeletonSignature = "";
let normalAttackSignature = "";

// HUD 计算层签名：每个面板缓存一个轻量签名，签名不变时跳过整段 DOM 构建，
// 避免每帧为脏检查本身支付字符串/数组分配（写入层 set* 缓存仍作为第二道防线）。
const panelSignatures = new WeakMap();
function panelChanged(keyElement, signature) {
  if (panelSignatures.get(keyElement) === signature) return false;
  panelSignatures.set(keyElement, signature);
  return true;
}

let resizeScheduled = false;
export function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// resize 事件风暴（iOS 工具栏收展、窗口拖拽）合并到每帧最多一次画布重建。
export function scheduleResize() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resizeCanvas();
  });
}

export function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = getViewScale();
  const view = getCamera();
  return { x: (event.clientX - rect.left) / scale + view.x, y: (event.clientY - rect.top) / scale + view.y };
}

export function getViewScale() {
  return Math.min(canvas.clientWidth / 940, canvas.clientHeight / 590);
}

export function getCamera(scale = getViewScale()) {
  const map = activeMap();
  const halfW = canvas.clientWidth / scale / 2;
  const halfH = canvas.clientHeight / scale / 2;
  return { x: clamp(state.player.x - halfW, 0, map.width - halfW * 2), y: clamp(state.player.y - halfH, 0, map.height - halfH * 2) };
}

export function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

export function log(message, type = "") {
  state.logs.push({ message, type });
  state.logs = state.logs.slice(-8);
  renderLog();
}

export function textAt(message, x, y, color = "#eef3f4", size = 13) {
  state.texts.push({ message, x, y, color, size, life: 1, vy: -26 });
}

export function spark(x, y, color, count = 8) {
  for (let i = 0; i < count; i += 1)
    state.particles.push({ x, y, vx: rand(-70, 70), vy: rand(-95, 20), life: rand(0.35, 0.7), color, size: rand(2, 4) });
}

export function roundedRect(target, x, y, width, height, radius) {
  target.beginPath();
  target.roundRect(x, y, width, height, radius);
}

// 静态地图层离屏缓存：地形、道路、战区装饰、水道、网格与地标只在切换地图时绘制一次，
// 每帧只做一次 drawImage，避免每帧重复描边整张地图（只保留当前地图的缓存）。
let groundLayer = null;

function paintGroundLayer(target, map) {
  const ctx = target;
  const p = map.palette;
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, map.width, map.height);
  // 道路
  ctx.strokeStyle = p.road;
  ctx.lineWidth = 70;
  map.paths.forEach((path) => {
    ctx.beginPath();
    ctx.moveTo(path[0], path[1]);
    ctx.bezierCurveTo(path[2], path[3], path[4], path[5], path[6], path[7]);
    if (path[8] !== undefined) ctx.bezierCurveTo(path[8], path[9], path[10], path[11], path[12], path[13]);
    ctx.stroke();
  });
  ctx.strokeStyle = p.roadHi;
  ctx.lineWidth = 30;
  map.paths.forEach((path) => {
    ctx.beginPath();
    ctx.moveTo(path[0], path[1]);
    ctx.bezierCurveTo(path[2], path[3], path[4], path[5], path[6], path[7]);
    if (path[8] !== undefined) ctx.bezierCurveTo(path[8], path[9], path[10], path[11], path[12], path[13]);
    ctx.stroke();
  });
  // 城镇与特殊区
  if (map.townRect) {
    ctx.fillStyle = p.town;
    ctx.fillRect(map.townRect.x, map.townRect.y, map.townRect.w, map.townRect.h);
    ctx.strokeStyle = p.townBorder;
    ctx.lineWidth = 3;
    ctx.strokeRect(map.townRect.x, map.townRect.y, map.townRect.w, map.townRect.h);
  }
  if (map.specialRect) {
    ctx.fillStyle = p.special;
    ctx.fillRect(map.specialRect.x, map.specialRect.y, map.specialRect.w, map.specialRect.h);
    ctx.strokeStyle = p.specialBorder;
    ctx.strokeRect(map.specialRect.x, map.specialRect.y, map.specialRect.w, map.specialRect.h);
  }
  drawRouteGuides(target, map);
  drawSiteDetails(target, map);
  // 水道
  ctx.strokeStyle = p.water;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(20, 300);
  ctx.bezierCurveTo(500, 420, 680, 250, 1050, 390);
  ctx.bezierCurveTo(1470, 550, 1660, 210, map.width - 10, 280);
  ctx.stroke();
  // 网格
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < map.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, map.height);
    ctx.stroke();
  }
  for (let y = 0; y < map.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(map.width, y);
    ctx.stroke();
  }
  drawLandmarks(target, map);
}

function getGroundLayer(map) {
  // 按 dpr 绘制静态层，避免 Retina 屏上 1× 位图被放大发虚；缓存键含 dpr。
  if (groundLayer?.mapId === map.id && groundLayer?.dpr === dpr) return groundLayer.canvas;
  const layer = document.createElement("canvas");
  const scale = Math.max(1, dpr);
  layer.width = map.width * scale;
  layer.height = map.height * scale;
  const layerCtx = layer.getContext("2d");
  layerCtx.scale(scale, scale);
  paintGroundLayer(layerCtx, map);
  groundLayer = { mapId: map.id, dpr: scale, canvas: layer };
  return layer;
}

export function drawWorld() {
  const map = activeMap();
  const scale = getViewScale();
  const view = getCamera(scale);
  const width = canvas.clientWidth / scale;
  const height = canvas.clientHeight / scale;
  ctx.save();
  ctx.scale(scale, scale);
  // 0.3.3 震屏：只偏移绘制，不影响点击命中与相机几何（render 层临时视觉）。
  if (fx.shake > 0) {
    const power = Math.max(0, fx.shakePower) * Math.min(1, fx.shake / 0.22);
    ctx.translate(rand(-power, power), rand(-power, power));
  }
  ctx.translate(-view.x, -view.y);
  ctx.fillStyle = "#1a2c23";
  ctx.fillRect(view.x, view.y, width, height);
  ctx.drawImage(getGroundLayer(map), 0, 0, map.width, map.height);
  drawTacticalPoints(map);
  drawExits(map);
  drawHazards();
  drawHealZones();
  state.drops.forEach(drawDrop);
  for (const entity of state.entities) {
    if (entity.alive) drawEntity(entity);
  }
  drawPierceBeam();
  drawSkillRangePreview();
  drawPlayer();
  // 0.3.3：目标指引箭头 + 升级光环在世界坐标系内绘制，跟随相机但不受 HUD 布局影响。
  drawGuideArrow();
  drawLevelUpFx();
  state.particles.forEach(drawParticle);
  state.texts.forEach(drawText);
  drawMonsterTooltip(view, width, height);
  if (moveTarget) {
    ctx.strokeStyle = "rgba(98, 213, 198, .7)";
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(moveTarget.x, moveTarget.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  // 连击 HUD 使用屏幕坐标绘制，不随相机移动（世界坐标恢复后再画）。
  drawComboHud();
}

// 目标指引箭头：按关卡阶段指向「最近的普通怪 → 首领 → 前进出口」，箭头绕玩家 54px，
// 下方显示目标名与格数（30px = 1 格），解决百图大地图里找不到目标的问题。
export function drawGuideArrow() {
  const map = activeMap();
  const progress = mapProgress();
  const forwardExit = map.exits.find((exit) => isForwardExit(exit, map.id));
  const guide = resolveGuideTarget({
    player: state.player,
    entities: state.entities,
    progress,
    boss: { x: map.boss.x, y: map.boss.y, name: map.boss.name },
    forwardExit
  });
  if (!guide?.target) return;
  const target = guide.target;
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 80) return;
  const angle = Math.atan2(dy, dx);
  const radius = 54;
  const x = state.player.x + Math.cos(angle) * radius;
  const y = state.player.y + Math.sin(angle) * radius;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = guide.color;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-5, -6);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = guide.color;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${guide.label} · ${Math.round(dist / 30)} 格`, state.player.x, state.player.y + 82);
  ctx.restore();
  ctx.textAlign = "start";
}

// 升级光环：fx.levelUp 在 1.1 秒内衰减，画一圈向外扩散的金色圆环。
export function drawLevelUpFx() {
  if (fx.levelUp <= 0) return;
  const ratio = clamp(fx.levelUp / 1.1, 0, 1);
  ctx.save();
  ctx.globalAlpha = ratio * 0.9;
  ctx.strokeStyle = "#e7b36b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, 26 + (1 - ratio) * 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 连击 HUD：屏幕顶部居中显示当前连击，临近结束（<0.8s）逐帧淡出。
export function drawComboHud() {
  if (fx.combo < 2) return;
  const width = canvas.clientWidth;
  const alpha = clamp(fx.comboTimer / 0.8, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = "#e7b36b";
  ctx.font = `700 ${18 + Math.min(18, fx.combo)}px Georgia, sans-serif`;
  ctx.fillText(`${fx.combo} 连击`, width / 2, 38);
  ctx.fillStyle = "rgba(238, 243, 244, .72)";
  ctx.font = "10px sans-serif";
  ctx.fillText(`每 ${COMBO_RULES.bonusEvery} 连击额外金币 · ${fx.comboTimer.toFixed(1)}s`, width / 2, 55);
  ctx.restore();
  ctx.textAlign = "start";
}

export function drawRouteGuides(target, map) {
  const ctx = target;
  const plan = map.routePlan;
  if (!plan) return;
  ctx.save();
  const label = (text, x, y, color = "#e7b36b") => {
    ctx.font = "600 11px sans-serif";
    const width = ctx.measureText(text).width + 16;
    ctx.fillStyle = "rgba(8, 16, 20, .78)";
    roundedRect(ctx, x - width / 2, y - 14, width, 22, 3);
    ctx.fill();
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 1);
  };
  const start = { x: map.townRect.x + map.townRect.w / 2, y: map.townRect.y + map.townRect.h / 2 };
  const entry = plan.bossEntry || { x: map.boss.x - 120, y: map.boss.y };
  ctx.fillStyle = "rgba(231, 179, 107, .75)";
  ctx.strokeStyle = "rgba(231, 179, 107, .62)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.lineTo(map.boss.x, map.boss.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(entry.x, entry.y, 16, 0, Math.PI * 2);
  ctx.stroke();
  label("首领入口", entry.x, entry.y - 22, "#f3b1a8");
  if (plan.branchEntry) {
    ctx.fillStyle = "rgba(98, 213, 198, .8)";
    ctx.strokeStyle = "rgba(98, 213, 198, .75)";
    ctx.beginPath();
    ctx.arc(plan.branchEntry.x, plan.branchEntry.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label("支路入口", plan.branchEntry.x, plan.branchEntry.y - 22, "#62d5c6");
    label("主路", Math.round((start.x + entry.x) / 2), Math.round((start.y + entry.y) / 2) - 34, "#e7b36b");
  } else if (plan.type === "zigzag") {
    label("折返战线", Math.round((start.x + entry.x) / 2), Math.round((start.y + entry.y) / 2) - 34, "#e7b36b");
  } else {
    label("主路", Math.round((start.x + entry.x) / 2), Math.round((start.y + entry.y) / 2) - 34, "#e7b36b");
  }
  if (map.specialRect?.tier === "chapter")
    label("章末决战战区", map.specialRect.x + map.specialRect.w / 2, map.specialRect.y - 16, "#f3b1a8");
  (plan.encounterBands || []).forEach((band, index) => {
    const route = band.route === "branch" ? map.branchPath : map.paths?.[0];
    if (!route) return;
    const point = routePoint(route, (band.from + band.to) / 2, band.route === "branch" ? 54 : -54);
    ctx.strokeStyle = band.route === "branch" ? "rgba(98, 213, 198, .5)" : "rgba(231, 179, 107, .45)";
    ctx.fillStyle = band.route === "branch" ? "#62d5c6" : "#e7b36b";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${index + 1} · ${band.label} · ${band.count}只`, point.x, point.y + 3);
  });
  ctx.textAlign = "start";
  ctx.restore();
}

export function drawSiteDetails(target, map) {
  const ctx = target;
  if (!map.siteStyle) return;
  const boss = map.boss;
  const rect = map.specialRect;
  ctx.save();
  ctx.strokeStyle = map.palette.specialBorder;
  ctx.fillStyle = map.palette.roadHi;
  ctx.lineWidth = 5;
  const post = (x, y, width = 18, height = 64) => {
    ctx.fillRect(x - width / 2, y - height / 2, width, height);
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);
  };
  const ring = (radius) => {
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (map.siteStyle.arena === "outpost") {
    [
      [rect.x + 35, rect.y + 35],
      [rect.x + rect.w - 35, rect.y + 35],
      [rect.x + 35, rect.y + rect.h - 35],
      [rect.x + rect.w - 35, rect.y + rect.h - 35]
    ].forEach(([x, y]) => post(x, y, 24, 80));
  } else if (map.siteStyle.arena === "trail") {
    ctx.setLineDash([18, 14]);
    ring(118);
    ctx.setLineDash([]);
  } else if (map.siteStyle.arena === "stockade") {
    ctx.setLineDash([28, 10]);
    ctx.strokeRect(rect.x + 22, rect.y + 22, rect.w - 44, rect.h - 44);
    ctx.setLineDash([]);
  } else if (map.siteStyle.arena === "ravine") {
    for (let offset = -150; offset <= 150; offset += 75) {
      post(boss.x + offset, rect.y + 32, 34, 82);
      post(boss.x + offset, rect.y + rect.h - 32, 34, 82);
    }
  } else if (map.siteStyle.arena === "altar") {
    [74, 126, 184].forEach(ring);
  } else if (map.siteStyle.arena === "maze") {
    [
      [-180, -120, 190, 22],
      [20, -55, 190, 22],
      [-145, 45, 190, 22],
      [55, 115, 180, 22]
    ].forEach(([dx, dy, width, height]) => {
      ctx.fillRect(boss.x + dx, boss.y + dy, width, height);
      ctx.strokeRect(boss.x + dx, boss.y + dy, width, height);
    });
  } else if (map.siteStyle.arena === "court") {
    [-155, -80, 80, 155].forEach((offset) => {
      post(boss.x + offset, boss.y - 135, 20, 72);
      post(boss.x + offset, boss.y + 135, 20, 72);
    });
  } else if (map.siteStyle.arena === "gate") {
    post(boss.x - 105, boss.y, 40, 230);
    post(boss.x + 105, boss.y, 40, 230);
    ctx.fillRect(boss.x - 105, boss.y - 118, 210, 24);
  } else if (map.siteStyle.arena === "sanctum") {
    [62, 122, 180].forEach(ring);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4)
      post(boss.x + Math.cos(angle) * 150, boss.y + Math.sin(angle) * 150, 13, 38);
  } else if (map.siteStyle.arena === "throne") {
    ring(190);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3)
      post(boss.x + Math.cos(angle) * 170, boss.y + Math.sin(angle) * 170, 24, 82);
    ctx.strokeRect(boss.x - 55, boss.y - 46, 110, 92);
  }
  ctx.restore();
}

export function drawTacticalPoints(map) {
  const progress = mapProgress(map.id);
  const pulse = 0.55 + Math.sin(Date.now() / 520) * 0.18;
  ctx.save();
  (map.tacticalPoints || []).forEach((point) => {
    const claimed = (point.kind === "resource" && progress.resourceClaimed) || (point.kind === "site" && progress.siteClaimed);
    const accent = point.kind === "rest" ? "98, 213, 198" : point.kind === "site" ? "185, 155, 234" : "231, 179, 107";
    ctx.globalAlpha = claimed ? 0.34 : 1;
    ctx.fillStyle = `rgba(${accent}, ${point.kind === "rest" ? 0.12 : 0.16})`;
    ctx.strokeStyle = `rgba(${accent}, ${point.kind === "rest" ? 0.48 : pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash(point.kind === "rest" ? [7, 5] : point.kind === "site" ? [3, 6] : []);
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.kind === "rest" ? 34 : 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (point.kind === "rest") {
      ctx.fillStyle = "rgba(98, 213, 198, .78)";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 18);
      ctx.lineTo(point.x - 13, point.y + 10);
      ctx.lineTo(point.x + 13, point.y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(231, 179, 107, .9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y + 6);
      ctx.lineTo(point.x, point.y - 9);
      ctx.stroke();
    } else if (point.kind === "site") {
      ctx.fillStyle = claimed ? "rgba(150, 140, 170, .55)" : "rgba(185, 155, 234, .92)";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 18);
      ctx.lineTo(point.x + 16, point.y);
      ctx.lineTo(point.x, point.y + 18);
      ctx.lineTo(point.x - 16, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(35, 45, 47, .85)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = claimed ? "rgba(230, 220, 255, .38)" : "rgba(230, 220, 255, " + pulse + ")";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 28, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = claimed ? "rgba(120, 140, 140, .55)" : "rgba(231, 179, 107, .9)";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 13);
      ctx.lineTo(point.x + 15, point.y);
      ctx.lineTo(point.x, point.y + 13);
      ctx.lineTo(point.x - 15, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(35, 45, 47, .8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = claimed ? "rgba(160, 170, 170, .55)" : "rgba(244, 234, 201, .72)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      claimed ? (point.kind === "site" ? point.name + "（已激活）" : point.name + "（已搜空）") : point.name,
      point.x,
      point.y + 49
    );
  });
  ctx.textAlign = "start";
  ctx.restore();
}

export function drawLandmarks(target, map) {
  const ctx = target;
  ctx.save();
  map.landmarks.forEach((l) => {
    ctx.fillStyle = l.color;
    ctx.strokeStyle = "rgba(236, 202, 134, .35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.fill();
    if (["tower", "tree", "beam", "dune", "ruin", "watchtower", "bridgepost", "obelisk", "courtpost", "gatepost"].includes(l.type))
      ctx.fillRect(l.x - 3, l.y - l.r - 15, 6, 13);
    if (["barricade", "palisade", "mazewall", "cliff"].includes(l.type)) {
      ctx.fillRect(l.x - l.r * 1.5, l.y - 5, l.r * 3, 10);
      ctx.strokeRect(l.x - l.r * 1.5, l.y - 5, l.r * 3, 10);
    }
    if (["shrine", "rune"].includes(l.type)) {
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (["signpost", "banner"].includes(l.type)) {
      ctx.fillRect(l.x - 2, l.y - l.r - 18, 4, l.r + 18);
      ctx.fillRect(l.x + 2, l.y - l.r - 16, l.r + 10, 12);
    }
    if (l.type === "throne" || l.type === "statue") ctx.strokeRect(l.x - l.r * 0.65, l.y - l.r, l.r * 1.3, l.r * 2);
    if (l.type === "lantern") {
      ctx.fillStyle = "rgba(255, 180, 90, .65)";
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r + 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (l.type === "well") {
      ctx.fillStyle = "rgba(120, 160, 200, .55)";
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r - 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.fillStyle = "rgba(231, 179, 107, .55)";
  ctx.font = "12px Georgia";
  map.landmarkLabels.forEach((l) => ctx.fillText(l.text, l.x, l.y));
  ctx.restore();
}

export function drawExits(map) {
  ctx.save();
  map.exits.forEach((exit) => {
    const target = MAPS[exit.target];
    const forward = isForwardExit(exit, map.id);
    const unlocked = !forward || mapProgress(map.id).completed;
    const pulse = 0.4 + Math.sin(Date.now() / 400) * 0.2;
    const color = unlocked ? (forward ? "231, 179, 107" : "98, 213, 198") : "241, 109, 102";
    ctx.fillStyle = `rgba(${color}, ${unlocked ? pulse * 0.35 : 0.12})`;
    ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
    ctx.strokeStyle = `rgba(${color}, ${unlocked ? 0.5 + pulse * 0.3 : 0.55})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(exit.x, exit.y, exit.w, exit.h);
    ctx.setLineDash([]);
    // 标签
    ctx.fillStyle = "rgba(9, 16, 19, .8)";
    const labelW = 110,
      labelH = 38;
    const lx = exit.x + exit.w / 2 - labelW / 2;
    const ly = exit.y + exit.h / 2 - labelH / 2;
    roundedRect(ctx, lx, ly, labelW, labelH, 4);
    ctx.fill();
    ctx.strokeStyle = `rgba(${color}, .5)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = unlocked ? (forward ? "#e7b36b" : "#62d5c6") : "#ee9b91";
    ctx.font = "600 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${forward ? "→" : "←"} ${exit.label}`, exit.x + exit.w / 2, ly + 16);
    ctx.fillStyle = "#8d9ca0";
    ctx.font = "10px sans-serif";
    ctx.fillText(unlocked ? (forward ? "已开启 · 进入下一关" : "返回上一关") : "未开启 · 完成当前关卡", exit.x + exit.w / 2, ly + 30);
    ctx.textAlign = "start";
  });
  ctx.restore();
}

export function drawHazards() {
  ctx.save();
  state.hazards.forEach((h) => {
    const alpha = h.snap ? Math.max(0, h.fade * 2) : (1.2 - h.life) / 1.2;
    if (h.snap) {
      // 爆发瞬间
      ctx.fillStyle = `rgba(241, 109, 102, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // 蓄力预警
      ctx.fillStyle = `rgba(241, 109, 102, ${alpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(241, 109, 102, ${alpha * 0.8})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // 倒计时圆环
      const progress = h.life / 1.2;
      ctx.strokeStyle = `rgba(255, 180, 90, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r - 4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// 生息法阵（0.3.4）：紫色回复圈，剩余时间越少外环越淡；玩家在圈内时加亮内圈提示生效。
export function drawHealZones() {
  if (!state.healZones?.length) return;
  ctx.save();
  state.healZones.forEach((zone) => {
    const ratio = clamp(zone.life / 4, 0, 1);
    const inside = distance(state.player, zone) <= zone.radius;
    ctx.fillStyle = `rgba(168, 140, 227, ${inside ? 0.18 : 0.1})`;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(168, 140, 227, ${0.35 + ratio * 0.45})`;
    ctx.lineWidth = inside ? 3 : 2;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 剩余时间刻度环：外圈按剩余秒数收缩，直观提示法阵还剩多久。
    ctx.strokeStyle = "rgba(198, 176, 240, .8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius + 6, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

// 雷矛穿透光束（0.3.4）：短暂的一道直线，只做视觉提示，伤害已在 skills.pickPierceTargets 结算。
export function drawPierceBeam() {
  if (!fx.pierce) return;
  const beam = fx.pierce;
  const alpha = clamp(beam.life / 0.18, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(120, 182, 236, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(214, 238, 255, ${alpha * 0.7})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();
  ctx.restore();
}

export function drawEntity(entity) {
  ctx.save();
  const selected = entity.id === state.player.targetId;
  const scale = entity.boss ? 1.22 : 1;
  if (selected) {
    ctx.strokeStyle = activeHero().color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius + 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (entity.hitFlash > 0) ctx.globalAlpha = 0.45;
  ctx.fillStyle = entity.color;
  if (entity.npc) {
    // 流浪武者：菱形轮廓 + 白名，与怪物在画面上直接区分。
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-entity.radius * 0.8, -entity.radius * 0.8, entity.radius * 1.6, entity.radius * 1.6);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    // 四类怪形变：尖刺 / 双环 / 方肩 / 双角，让同类怪在画面上可辨识。
    const morph = entity.morph ?? 0;
    if (morph === 1) {
      ctx.beginPath();
      ctx.arc(entity.x - entity.radius * 0.45, entity.y, entity.radius * 0.36, 0, Math.PI * 2);
      ctx.arc(entity.x + entity.radius * 0.45, entity.y, entity.radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
    } else if (morph === 2) {
      ctx.fillRect(entity.x - entity.radius, entity.y - entity.radius * 0.4, entity.radius * 2, entity.radius * 0.8);
    } else if (morph === 3) {
      ctx.beginPath();
      ctx.moveTo(entity.x - entity.radius * 0.7, entity.y - entity.radius * 0.9);
      ctx.lineTo(entity.x - entity.radius * 0.2, entity.y - entity.radius * 0.3);
      ctx.lineTo(entity.x - entity.radius * 0.9, entity.y - entity.radius * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(entity.x + entity.radius * 0.7, entity.y - entity.radius * 0.9);
      ctx.lineTo(entity.x + entity.radius * 0.2, entity.y - entity.radius * 0.3);
      ctx.lineTo(entity.x + entity.radius * 0.9, entity.y - entity.radius * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = entity.boss ? "#f4c484" : "rgba(242, 220, 174, .7)";
  ctx.beginPath();
  ctx.arc(entity.x - entity.radius * 0.28, entity.y - entity.radius * 0.3, entity.boss ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();
  if (entity.boss) {
    ctx.strokeStyle = "rgba(241, 109, 102, .65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius * scale + 8, 0, Math.PI * 2);
    ctx.stroke();
    if (entity.phase >= 2) {
      ctx.strokeStyle = "rgba(255, 180, 90, .8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(entity.x, entity.y, entity.radius * scale + 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // 0.3.4 攻击前摇：红色蓄力环随前摇收拢，收拢到底即出手；玩家可据此走位躲开（落空）。
  if (entity.windup > 0 && entity.windupTotal > 0) {
    const ratio = clamp(entity.windup / entity.windupTotal, 0, 1);
    ctx.strokeStyle = `rgba(241, 109, 102, ${0.4 + (1 - ratio) * 0.5})`;
    ctx.lineWidth = 2 + (1 - ratio) * 2;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius * scale + 10 + ratio * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 召唤物（骨卫）：青色虚线环标识友军，避免误认为可攻击怪物。
  if (entity.friendly) {
    ctx.strokeStyle = "rgba(98, 213, 198, .6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 0.3.3 怪物命中玩家的瞬间：朝玩家方向闪一道红色挥击弧（纯视觉反馈，不改变伤害结算）。
  if (entity.attackFlash > 0) {
    const angle = Math.atan2(state.player.y - entity.y, state.player.x - entity.x);
    ctx.strokeStyle = "rgba(241, 109, 102, .85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius * scale + 7, angle - 0.45, angle + 0.45);
    ctx.stroke();
  }
  ctx.restore();
  drawNameplate(entity);
}

export function drawNameplate(entity) {
  const width = entity.boss ? 160 : 118;
  const left = entity.x - width / 2;
  const top = entity.y - entity.radius - (entity.boss ? 48 : 39);
  ctx.fillStyle = "rgba(9, 16, 19, .82)";
  roundedRect(ctx, left, top, width, 31, 3);
  ctx.fill();
  ctx.fillStyle = entity.npc ? "#eef4ef" : entity.boss ? "#f3b1a8" : "#c7d2cb";
  ctx.font = `${entity.boss || entity.npc ? 11 : 9}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(
    `Lv.${entity.level} ${entity.name}${entity.npc ? " · 玩家" : ""}${entity.boss ? ` · P${entity.phase}` : ""}`,
    entity.x,
    top + 11
  );
  ctx.fillStyle = "#8d9ca0";
  ctx.font = "8px sans-serif";
  ctx.fillText(`${Math.ceil(entity.hp)} / ${entity.maxHp}`, entity.x, top + 21);
  ctx.fillStyle = "#0c1518";
  ctx.fillRect(left + 7, top + 25, width - 14, 4);
  ctx.fillStyle = entity.boss ? "#f16d66" : "#8fc7a2";
  ctx.fillRect(left + 7, top + 25, (width - 14) * clamp(entity.hp / entity.maxHp, 0, 1), 4);
  ctx.textAlign = "start";
}

export function drawMonsterTooltip(view, viewWidth, viewHeight) {
  const entity = state.entities.find((entry) => entry.id === state.hoveredEntityId && entry.alive);
  if (!entity) return;
  const profile = monsterProfile(entity, activeMap());
  const width = 244;
  const height = entity.boss ? 112 : 104;
  const x = clamp(entity.x + entity.radius + 18, view.x + 12, view.x + viewWidth - width - 12);
  const y = clamp(entity.y - entity.radius - 18, view.y + 12, view.y + viewHeight - height - 12);
  ctx.save();
  ctx.fillStyle = "rgba(8, 16, 20, .96)";
  ctx.strokeStyle = entity.boss ? "rgba(241, 109, 102, .55)" : "rgba(98, 213, 198, .42)";
  ctx.lineWidth = 1;
  roundedRect(ctx, x, y, width, height, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = entity.boss ? "#f3b1a8" : "#eef3f4";
  ctx.font = "600 11px sans-serif";
  ctx.fillText(`Lv.${entity.level} ${entity.name}${entity.boss ? " · 区域首领" : ""}`, x + 11, y + 17);
  ctx.fillStyle = "#e7b36b";
  ctx.font = "9px sans-serif";
  ctx.fillText(`生命 ${Math.ceil(entity.hp)}/${entity.maxHp} · 攻击 ${entity.attack} · 防御 ${entity.defense}`, x + 11, y + 33);
  ctx.fillStyle = "#9fadaf";
  ctx.fillText(profile.intro, x + 11, y + 49, width - 22);
  ctx.fillStyle = "#62d5c6";
  ctx.fillText("技能", x + 11, y + 67);
  ctx.fillStyle = "#c7d2cb";
  profile.skills.forEach((skill, index) => ctx.fillText(`· ${skill}`, x + 11, y + 83 + index * 14));
  ctx.restore();
}

export function drawDrop(drop) {
  ctx.save();
  ctx.translate(drop.x, drop.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = drop.color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.globalAlpha = 0.28;
  ctx.fillRect(-11, -11, 22, 22);
  ctx.restore();
}
export function drawSkillRangePreview() {
  const index = state.player.previewSkill;
  if (!Number.isInteger(index)) return;
  const skill = activeHero().skills[index];
  if (!skill?.area) return;
  const hero = activeHero();
  ctx.save();
  ctx.fillStyle = `${hero.color}22`;
  ctx.strokeStyle = hero.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, skill.area, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = hero.color;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${skill.name} · ${skill.areaLabel}`, state.player.x, state.player.y + skill.area + 16);
  ctx.restore();
}

export function drawPlayer() {
  const hero = activeHero();
  const maxHp = playerMaxHp();
  const left = state.player.x - 44;
  const top = state.player.y - 56;
  ctx.save();
  ctx.globalAlpha = state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 8) % 2 === 0 ? 0.45 : 1;
  ctx.fillStyle = "rgba(8, 15, 18, .82)";
  roundedRect(ctx, left, top, 88, 24, 3);
  ctx.fill();
  ctx.fillStyle = "#eef3f4";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Lv.${state.player.level} 灰烬旅人`, state.player.x, top + 10);
  ctx.fillStyle = "#0c1518";
  ctx.fillRect(left + 6, top + 15, 76, 5);
  ctx.fillStyle = "#f16d66";
  ctx.fillRect(left + 6, top + 15, 76 * clamp(state.player.hp / maxHp, 0, 1), 5);
  ctx.fillStyle = hero.color;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, 25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#102027";
  ctx.beginPath();
  ctx.arc(state.player.x + 6, state.player.y - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  if (state.player.poison > 0) {
    ctx.fillStyle = `rgba(168, 140, 227, ${0.3 + state.player.poison * 0.12})`;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 28, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.player.charge >= 100) {
    ctx.strokeStyle = "#e7b36b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 30, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
export function drawParticle(particle) {
  ctx.save();
  ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
  ctx.fillStyle = particle.color;
  ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  ctx.restore();
}
export function drawText(text) {
  ctx.save();
  ctx.globalAlpha = clamp(text.life * 2, 0, 1);
  ctx.fillStyle = text.color;
  ctx.font = `700 ${text.size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text.message, text.x, text.y);
  ctx.restore();
}

// HUD 写入缓存：内容未变化时跳过 DOM 写入，避免每帧重建（WeakMap 随元素一起回收）。
const textCache = new WeakMap();
const htmlCache = new WeakMap();
const styleCache = new WeakMap();
const classCache = new WeakMap();

function setText(element, text) {
  const value = String(text);
  if (textCache.get(element) === value) return;
  textCache.set(element, value);
  element.textContent = value;
}

function setHtml(element, html) {
  if (htmlCache.get(element) === html) return;
  htmlCache.set(element, html);
  element.innerHTML = html;
}

function setStyle(element, property, value) {
  const cache = styleCache.get(element) || {};
  if (cache[property] === value) return;
  cache[property] = value;
  styleCache.set(element, cache);
  element.style[property] = value;
}

function setClass(element, name, enabled) {
  const cache = classCache.get(element) || {};
  if (cache[name] === enabled) return;
  cache[name] = enabled;
  classCache.set(element, cache);
  element.classList.toggle(name, enabled);
}

function setClassName(element, className) {
  const cache = classCache.get(element) || {};
  if (cache.__className === className) return;
  cache.__className = className;
  classCache.set(element, cache);
  element.className = className;
}

export function renderTarget() {
  const target = state?.entities.find((entity) => entity.id === state.player.targetId && entity.alive);
  if (state && !panelChanged($("targetText"), `${state.player.targetId}|${target ? Math.ceil(target.hp) : 0}`)) return;
  setText($("targetText"), target ? target.name : "未锁定目标");
  setText($("targetHint"), target ? `${Math.max(0, Math.round(target.hp))} / ${target.maxHp} HP` : "靠近怪物开始战斗");
}
export function renderLog() {
  const last = state.logs[state.logs.length - 1];
  if (!panelChanged($("eventLog"), `${state.logs.length}|${last?.message}`)) return;
  setHtml(
    $("eventLog"),
    state.logs
      .slice()
      .reverse()
      .map((entry) => `<div class="event-entry ${entry.type}">${entry.message}</div>`)
      .join("")
  );
}

export function renderPlayer() {
  const hero = activeHero();
  const maxResource = hero.resource;
  // 战力汇总：装备按「有效战力」计入（含强化 +15 与攻击词缀收益，docs/03），
  // 使 HUD 数值能反映强化与词缀的实际提升，而非只显示基础 power。
  const power =
    hero.attack +
    state.player.level * 4 +
    Object.values(state.player.equipment).reduce((sum, item) => sum + (item ? effectiveItemPower(item) : 0), 0) +
    hero.defense * 2;
  const signature = [
    state.classId,
    power,
    Math.ceil(state.player.resource),
    state.player.exp,
    state.player.nextExp,
    state.player.gold,
    state.player.marks,
    state.player.potion,
    state.quest.kills,
    state.quest.bossDefeated
  ].join("|");
  if (!panelChanged($("powerText"), signature)) return;
  const avatar = $("avatar");
  setText(avatar, hero.glyph);
  setStyle(avatar, "color", hero.color);
  setStyle(avatar, "borderColor", hero.color);
  setText($("className"), hero.name);
  setText($("playerName"), `${hero.name} · 灰烬旅人`);
  setText($("powerText"), formatNumber(power));
  setText($("actionResourceName"), hero.resourceName);
  setText($("actionResourceText"), `${Math.ceil(state.player.resource)} / ${maxResource}`);
  setStyle($("actionResourceBar"), "width", `${clamp((state.player.resource / maxResource) * 100, 0, 100)}%`);
  // 0.3.2：经验条真实可升，副标题同时显示本关等级上限，避免玩家误以为「打怪永远不升级」。
  // 上限 = 主线曲线等级 + 1（终局封顶 41），与 main.js 的 currentLevelCap 保持一致。
  const clearedMaps = MAP_ORDER.filter((id) => state.mapProgress?.[id]?.completed).length;
  const levelCap = Math.min(41, campaignGrowth(clearedMaps).level + 1);
  setText($("expLabel"), `升级进度 · 本关最高 Lv.${levelCap}`);
  setText($("expText"), `${state.player.exp} / ${state.player.nextExp}`);
  setStyle($("expBar"), "width", `${clamp((state.player.exp / state.player.nextExp) * 100, 0, 100)}%`);
  setText($("potionKey"), keyLabel("potion"));
  setText($("goldText"), formatNumber(state.player.gold));
  setText($("markText"), `${state.player.marks} / 800`);
  setText($("potionCount"), state.player.potion);
  // 战斗统计与罪恶值：PK 状态一眼可见（红名用红色胶囊）。
  const cleared = MAP_ORDER.filter((id) => state.mapProgress?.[id]?.completed).length;
  setText($("statsLine"), `击杀 ${formatNumber(state.player.totalKills || 0)} · 死亡 ${state.player.deaths || 0} · 通关 ${cleared}/100`);
  const sin = state.player.sin || 0;
  const sinEl = $("sinPill");
  if (sin > 0) {
    sinEl.classList.remove("hidden");
    setText(sinEl, sin >= PK_RULES.redNameThreshold ? `红名 · 罪恶 ${sin}` : `罪恶 ${sin}`);
    setClass(sinEl, "red", sin >= PK_RULES.redNameThreshold);
  } else sinEl.classList.add("hidden");
  const points = state.player.skillPoints || 0;
  $("skillBtn").classList.toggle("has-points", points > 0);
  setText($("skillPointBadge"), String(points));
  const questProgress = state.quest.completed ? 100 : (state.quest.kills / state.quest.need) * 70 + (state.quest.bossDefeated ? 30 : 0);
  setStyle($("questBar"), "width", `${questProgress}%`);
  setText($("questText"), `${state.quest.kills} / ${state.quest.need} 普通怪 · Boss ${state.quest.bossDefeated ? "已击败" : "未击败"}`);
}

export function objectiveView() {
  const map = activeMap();
  const rule = MAP_CLEAR_RULES[map.id];
  const progress = mapProgress();
  if (progress.completed && !rule.next)
    return { step: "全部完成", title: "百图征途已通关", text: "100 张地图与 100 名区域首领均已完成。", complete: true };
  if (progress.completed)
    return { step: "步骤 3 / 3", title: `前往${rule.exit}`, text: `走入金色出口，进入下一关 ${MAPS[rule.next].name}。`, complete: true };
  if (progress.kills < progress.need)
    return {
      step: "步骤 1 / 3",
      title: "清剿区域怪物",
      text: `击败 ${progress.need} 只普通怪物，当前 ${progress.kills}/${progress.need}。`,
      complete: false
    };
  return { step: "步骤 2 / 3", title: `击败 ${rule.boss}`, text: "普通怪清剿已完成，前往首领区域完成关卡。", complete: false };
}

export function renderMapObjective() {
  const map = activeMap();
  const rule = MAP_CLEAR_RULES[map.id];
  const progress = mapProgress();
  const view = objectiveView();
  const signature = [
    map.id,
    progress.kills,
    progress.need,
    progress.bossDefeated,
    progress.completed,
    progress.rewardClaimed,
    view.step
  ].join("|");
  if (!panelChanged($("mapObjective"), signature)) return;
  setClass($("mapObjective"), "complete", view.complete);
  setText($("mapObjectiveState"), view.step);
  setText($("mapObjectiveTitle"), view.title);
  setText($("mapObjectiveText"), view.text);
  // 三条勾选项拆成数组拼接，避免单行模板字符串超过 400 字符；输出 HTML 与拆分前一致。
  const killDone = progress.kills >= progress.need;
  const bossClass = progress.bossDefeated ? "done" : killDone ? "current" : "";
  const exitCheck = rule.next
    ? { cls: progress.completed ? "current" : "", mark: progress.completed ? "→" : "○", label: rule.exit }
    : { cls: progress.completed ? "done" : "", mark: progress.completed ? "✓" : "○", label: "最终结算" };
  setHtml(
    $("mapObjectiveChecks"),
    [
      `<span class="${killDone ? "done" : "current"}">${killDone ? "✓" : "○"} 普通怪 ${progress.kills}/${progress.need}</span>`,
      `<span class="${bossClass}">${progress.bossDefeated ? "✓" : "○"} ${rule.boss}</span>`,
      `<span class="${exitCheck.cls}">${exitCheck.mark} ${exitCheck.label}</span>`
    ].join("")
  );
  setText($("questTitle"), `${map.story.beatTitle} · ${map.name}`);
  setText(
    $("questDescription"),
    rule.next
      ? `${map.story.objective}；完成清怪与首领目标后进入${MAPS[rule.next].name}。`
      : `${map.story.objective}；击败玄烬帝尊，结束第千次轮回。`
  );
  setText($("questTag"), progress.completed ? (rule.next ? "出口已开启" : "已通关") : "进行中");
  setText($("questReward"), progress.rewardClaimed ? "通关奖励已领取" : `通关奖励：${QUEST_REWARD.gold} 金币 · ${QUEST_REWARD.marks} 印记`);
}

export function renderMapHeader() {
  const map = activeMap();
  // 区域动态：首领刷新读秒直接取实体 respawn，避免状态副本与实体脱节
  const bossEntity = state.entities.find((entity) => entity.boss);
  const progress = mapProgress();
  const signature = [
    map.id,
    bossEntity?.alive,
    bossEntity && !bossEntity.alive ? Math.ceil(bossEntity.respawn) : bossEntity?.phase || 1,
    progress.completed,
    progress.siteClaimed,
    progress.resourceClaimed
  ].join("|");
  if (!panelChanged($("mapDynamics"), signature)) return;
  setText($("mapTitle"), `${map.name} · ${map.subtitle}`);
  setText($("mapLevelRange"), `推荐 Lv.${map.levelMin}-${map.levelMax}`);
  const dangerEl = $("mapDanger");
  setText(dangerEl, map.dangerLabel);
  setClassName(dangerEl, `pill ${map.danger === "safe" ? "safe" : map.danger === "danger" || map.danger === "desolate" ? "danger" : ""}`);
  const dynamics = [];
  if (bossEntity && !bossEntity.alive)
    dynamics.push(`<span class="world-event"><i></i> 首领已击破 · ${Math.ceil(bossEntity.respawn)}s 后刷新</span>`);
  else dynamics.push(`<span class="world-event"><i></i> 首领在场 · 阶段 ${bossEntity?.phase || 1}</span>`);
  const rule = MAP_CLEAR_RULES[map.id];
  if (!rule.next && progress.completed)
    dynamics.push(`<span class="world-event ready"><i class="gold"></i> 100/100 通关 · 百图征途完成</span>`);
  else if (rule.next)
    dynamics.push(
      `<span class="world-event ${progress.completed ? "ready" : "locked"}"><i class="gold"></i> ${rule.exit}${progress.completed ? `已开启 · 前往 ${MAPS[rule.next].name}` : "未开启 · 完成清怪与首领目标"}</span>`
    );
  const restCount = (map.tacticalPoints || []).filter((point) => point.kind === "rest").length;
  const cache = (map.tacticalPoints || []).find((point) => point.kind === "resource");
  const site = (map.tacticalPoints || []).find((point) => point.kind === "site");
  if (site)
    dynamics.push(
      '<span class="world-event"><i class="gold"></i> ' + (progress.siteClaimed ? site.name + "已激活" : "F " + site.name) + "</span>"
    );
  const cacheHint =
    cache && progress.resourceClaimed ? "秘藏已搜空" : cache?.route === "branch" ? "可选支路 · F 搜寻秘藏补给箱" : "F 搜寻秘藏补给箱";
  dynamics.push(`<span class="world-event"><i class="gold"></i> ${restCount} 处篝火 · ${cacheHint}</span>`);
  if (map.routePlan) {
    const plan = map.routePlan;
    const routeText =
      plan.type === "fork" || plan.type === "radial"
        ? `主路 ${plan.mainLength} · 支路 ${plan.branchLength}`
        : `${plan.summary} · ${plan.mainLength}`;
    dynamics.push(`<span class="world-event route-plan"><i></i> ${routeText} · 首领入口缓冲 ${plan.bossEntryBuffer}px</span>`);
  }
  setHtml($("mapDynamics"), dynamics.join(""));
}

// 区域导航点击使用事件委托，只在模块加载时绑定一次，避免随列表重建反复绑定监听器。
$("regionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-map-id]");
  if (!button) return;
  const map = activeMap();
  const id = button.dataset.mapId;
  if (id === map.id) return;
  const target = MAPS[id];
  const exit = map.exits.find((e) => e.target === id);
  if (!exit) {
    showToast(`${target.name} 不相邻，需要先走到相邻地图`);
    return;
  }
  if (isForwardExit(exit) && !mapProgress().completed) {
    const progress = mapProgress();
    const rule = MAP_CLEAR_RULES[map.id];
    showToast(`尚未通关：普通怪 ${progress.kills}/${progress.need}，${rule.boss}${progress.bossDefeated ? "已击败" : "未击败"}`);
    return;
  }
  showToast(`${target.name} 在场景边缘的发光出口处，请走到出口触发切换`);
});

export function renderRegion() {
  const map = activeMap();
  const idx = MAP_ORDER.indexOf(map.id);
  const windowSize = 6;
  const start = clamp(idx - 2, 0, MAP_ORDER.length - windowSize);
  const visibleIds = MAP_ORDER.slice(start, start + windowSize);
  const signature = `${map.id}|${visibleIds
    .map((id) => {
      const progress = mapProgress(id);
      return [id, state.player.visitedMaps[id] ? 1 : 0, progress.completed, progress.kills, progress.bossDefeated].join(".");
    })
    .join("|")}`;
  if (!panelChanged($("regionList"), signature)) return;
  const html = visibleIds
    .map((id) => {
      const i = MAP_ORDER.indexOf(id);
      const m = MAPS[id];
      const isCurrent = id === map.id;
      const isVisited = state.player.visitedMaps[id];
      const accessible = Math.abs(i - idx) <= 1;
      const progress = mapProgress(id);
      const progressLabel = progress.completed
        ? "已通关"
        : isCurrent || progress.kills > 0 || progress.bossDefeated
          ? `进行中 ${progress.kills}/${progress.need}`
          : "未开始";
      const dangerCls = m.danger === "safe" ? "safe" : m.danger === "danger" || m.danger === "desolate" ? "danger" : "";
      return `<button class="region-node ${isCurrent ? "current" : ""} ${isVisited ? "visited" : ""} ${accessible ? "accessible" : ""}" data-map-id="${id}"${isCurrent ? ' aria-current="true"' : ""} title="${m.name}：推荐 Lv.${m.levelMin}-${m.levelMax}，${m.dangerLabel}${isVisited ? "" : "（未到访）"}">
      <span class="region-name">${String(i + 1).padStart(3, "0")} · ${m.name}</span>
      <span class="region-level">第 ${m.chapter} 章 · Lv.${m.levelMin}-${m.levelMax}</span>
      <span class="region-danger ${dangerCls}">${m.dangerLabel}</span>
      <span class="region-progress ${progress.completed ? "done" : ""}">${progressLabel}</span>
    </button>`;
    })
    .join("");
  setText(document.querySelector(".region-tip"), `第 ${idx + 1} / 100 关`);
  setHtml($("regionList"), html);
}

export function renderNormalAttack() {
  const hero = activeHero();
  // 签名包含当前普攻键位：改键后立即重建按钮上的按键角标。
  const signature = `${hero.name}|${keyLabel("attack")}`;
  if (normalAttackSignature === signature) return;
  normalAttackSignature = signature;
  const resourceEffect =
    state.classId === "warrior" ? "命中额外获得 6 怒气。" : state.classId === "mage" ? "发射炎弹并消耗 8 法力。" : "命中获得 4 符力。";
  setHtml(
    $("normalAttackBtn"),
    `<span class="attack-key">${keyLabel("attack")}</span><strong>普攻</strong><small>100% 攻击</small><span class="skill-tooltip"><b>普通攻击</b><span>对当前锁定目标造成 100% 主属性伤害。${resourceEffect}</span><em>靠近目标后可连续使用 · 可在「设置」中修改按键</em></span>`
  );
}

export function renderSkills() {
  const hero = activeHero();
  // 骨架只在换职业或改技能键位时重建；冷却角标与禁用态逐按钮更新，
  // 避免冷却期间每秒整段 innerHTML 重建导致键盘焦点丢失（可访问性回归）。
  const skillKeys = [0, 1, 2, 3].map((index) => keyLabel(`skill${index + 1}`)).join("");
  const skeletonSignature = `${state.classId}|${skillKeys}`;
  if (skillSkeletonSignature !== skeletonSignature) {
    skillSkeletonSignature = skeletonSignature;
    setHtml(
      $("skillBar"),
      hero.skills
        .map((skill, index) => {
          // 拆出范围文案，避免单行模板字符串超过 400 字符；输出 HTML 与拆分前一致。
          const rangeText = skill.area ? `范围：以角色为中心 ${skill.areaLabel}` : `施法距离：${Math.round(skill.range / 30)} 格`;
          const skillLevel = state.player.skillLevels?.[index] || 0;
          return (
            `<button class="skill-button" data-skill="${index}" aria-label="${skill.name}${skillLevel ? ` Lv.${skillLevel}` : ""}">` +
            `<span class="skill-key">${keyLabel(`skill${index + 1}`)}${skillLevel ? `·${skillLevel}` : ""}</span><strong>${skill.name}</strong><small>${skill.cost} ${hero.resourceName}</small>` +
            `<span class="skill-tooltip"><b>${skill.name} · ${skill.kind}</b><span>${skill.desc}</span><em>${rangeText} · 冷却 ${skill.cd} 秒</em></span>` +
            `<span class="cooldown"></span>` +
            `</button>`
          );
        })
        .join("")
    );
  }
  $("skillBar")
    .querySelectorAll("[data-skill]")
    .forEach((button) => {
      const index = Number(button.dataset.skill);
      const remaining = state.player.cooldowns[index];
      const badge = button.querySelector(".cooldown");
      if (badge) {
        setText(badge, remaining > 0 ? String(Math.ceil(remaining)) : "");
        setStyle(badge, "display", remaining > 0 ? "grid" : "none");
      }
      setClass(button, "on-cooldown", remaining > 0);
      // 0.3.3：资源不足时按钮变暗，玩家不必点一下才知道放不出来。
      const skill = activeHero().skills[index];
      setClass(button, "no-resource", remaining <= 0 && state.player.resource < skill.cost);
      const shouldBeDisabled = remaining > 0;
      if (button.disabled !== shouldBeDisabled) button.disabled = shouldBeDisabled;
    });
}

export function renderEquipment() {
  // 12 部位（docs/03）；点击已穿戴的槽位 = 尝试强化。
  const signature = EQUIPMENT_SLOT_KEYS.map((slotKey) => {
    const item = state.player.equipment?.[slotKey];
    return item ? `${item.id}:${item.enhance || 0}:${item.blessing || 0}` : "-";
  }).join("|");
  if (!panelChanged($("equipmentGrid"), signature)) return;
  setHtml(
    $("equipmentGrid"),
    EQUIPMENT_SLOT_KEYS.map((slotKey) => {
      const item = state.player.equipment?.[slotKey];
      const label = EQUIPMENT_SLOTS[slotKey].label;
      if (!item)
        return `<button class="equipment-slot" data-equip-slot="${slotKey}" title="${label}空位：拾取对应部位装备后自动穿戴位"><span class="slot-glyph">+</span><span class="slot-name">${label}</span></button>`;
      const affixText = (item.affixes || []).map((affix) => `${affix.label} +${affix.value}${affix.percent ? "%" : ""}`).join("、");
      const powerValue = effectiveItemPower(item);
      const maxed = (item.enhance || 0) >= 15;
      const title = `${item.name}${item.enhance ? ` +${item.enhance}` : ""}：${item.desc}${affixText ? `；词缀：${affixText}` : ""}\n有效战力 ${powerValue}；点击强化（+8 起需材料，失败不降级）`;
      return `<button class="equipment-slot filled${maxed ? " maxed" : ""}" data-equip-slot="${slotKey}" title="${title}"><span class="slot-glyph">${item.glyph}</span><span class="slot-name">${label}</span>${item.enhance ? `<span class="slot-enhance">+${item.enhance}</span>` : ""}${maxed ? `<span class="slot-max">MAX</span>` : ""}<span class="slot-power">${powerValue}</span>${item.blessing ? `<span class="slot-bless">${item.blessing}%</span>` : ""}</button>`;
    }).join("")
  );
}
export function renderInventory() {
  const inventory = state.inventory || [];
  // 签名含 id 与 count：材料堆叠数量变化（count）也触发背包重渲染。
  const signature = inventory.map((item) => `${item.id}:${item.count || 1}`).join(",");
  if (!panelChanged($("inventoryGrid"), signature)) return;
  setText($("inventoryCount"), `${inventory.length}/12`);
  setHtml(
    $("inventoryGrid"),
    Array.from({ length: 12 }, (_, index) => {
      const item = inventory[index];
      if (!item) return `<div class="inventory-slot empty" data-item-index="${index}"></div>`;
      if (item.slot === "material") {
        // 材料格：只显示数量（×N）与品质点，不显示战力（材料 power 0 无意义）。
        const count = item.count || 1;
        return `<div class="inventory-slot" data-item-index="${index}" title="${item.name}：${item.desc}；持有 ×${count}"><span class="quality-line" style="color:${item.color}"></span><span class="slot-glyph" style="color:${item.color}">${item.glyph}</span><span class="slot-power">×${count}</span></div>`;
      }
      const affixText = (item.affixes || []).map((affix) => `${affix.label} +${affix.value}${affix.percent ? "%" : ""}`).join("、");
      const powerValue = effectiveItemPower(item);
      const title = `${item.name}${item.enhance ? ` +${item.enhance}` : ""}：${item.desc}${affixText ? `；词缀：${affixText}` : ""}；有效战力 ${powerValue}`;
      return `<div class="inventory-slot" data-item-index="${index}" title="${title}"><span class="quality-line" style="color:${item.color}"></span><span class="slot-glyph" style="color:${item.color}">${item.glyph}</span>${item.enhance ? `<span class="enhance">+${item.enhance}</span>` : ""}<span class="slot-power">${powerValue}</span><button class="salvage-btn" data-salvage-id="${item.id}" title="拆解：返还 1 黑铁矿石与 10% 价值金币">拆</button></div>`;
    }).join("")
  );
}

// 城镇杂货商面板（0.3.5）：只在城镇内展示。
// 价格与购买资格来自 shop.js；写回金币 / 背包由 main.js 的 buyGoods / reforgeEquipped 负责。
export function renderShopPanel() {
  const card = $("shopCard");
  if (!card || !state) return;
  setClass(card, "hidden", !state.shopOpen);
  if (!state.shopOpen) return;
  const gold = state.player.gold;
  const scrolls = state.player.reforgeScroll || 0;
  setText($("shopTip"), `金币 ${formatNumber(gold)} · 词缀重铸卷 ×${scrolls}（按 F 关闭）`);
  // 签名包含金币、卷轴与已穿戴装备的词缀状态：任一变化都重建商品 / 重铸列表。
  const equipmentSignature = EQUIPMENT_SLOT_KEYS.map((slotKey) => {
    const item = state.player.equipment?.[slotKey];
    return item ? `${item.id}:${item.enhance || 0}:${(item.affixes || []).map((affix) => `${affix.key}${affix.value}`).join("&")}` : "-";
  }).join("|");
  if (!panelChanged($("shopGoods"), `v1|${gold}|${scrolls}|${equipmentSignature}`)) return;
  setHtml(
    $("shopGoods"),
    SHOP_GOODS.map((good) => {
      const affordable = gold >= good.price;
      return `<div class="shop-good${affordable ? "" : " unaffordable"}"><span class="shop-good-glyph" style="color:${good.color}">${good.glyph}</span><div class="shop-good-info"><strong>${good.name}</strong><small>${good.desc}</small></div><button class="link-button" data-buy="${good.id}" ${affordable ? "" : "disabled"}>${good.price} 金币</button></div>`;
    }).join("")
  );
  const rows = EQUIPMENT_SLOT_KEYS.map((slotKey) => {
    const item = state.player.equipment?.[slotKey];
    if (!item) return "";
    const quote = reforgeQuote(item, { gold, scrolls });
    const affixText =
      (item.affixes || []).map((affix) => `${affix.label} +${affix.value}${affix.percent ? "%" : ""}`).join("、") || "无词缀";
    return `<div class="shop-reforge-row"><span class="shop-good-glyph" style="color:${item.color}">${item.glyph}</span><div class="shop-good-info"><strong>${EQUIPMENT_SLOTS[slotKey].label}：${item.name}${item.enhance ? ` +${item.enhance}` : ""}</strong><small>词缀 ${item.affixes?.length || 0} 条 · ${affixText}</small></div><button class="link-button" data-reforge="${slotKey}" ${quote.canReforge ? "" : "disabled"} title="${quote.reason || `消耗 ${quote.cost} 金币 + ${quote.scrollNeeded} 张词缀重铸卷`}">重铸 ${quote.cost} 金</button></div>`;
  }).join("");
  setHtml($("shopReforge"), rows || `<p class="shop-empty">没有穿戴装备可重铸：先拾取并穿戴一件装备。</p>`);
}
export function renderBoss() {
  const boss = state.entities.find((entity) => entity.boss);
  if (!boss) return;
  if (
    !panelChanged(
      $("bossAlertText"),
      `${boss.alive ? 1 : 0}|${Math.ceil(boss.alive ? (boss.hp / boss.maxHp) * 100 : boss.respawn)}|${boss.phase}`
    )
  )
    return;
  setText(
    $("bossAlertText"),
    boss.alive
      ? `${boss.name} · ${Math.ceil((boss.hp / boss.maxHp) * 100)}% 生命 · 阶段 ${boss.phase}/${activeMap().boss.phases}`
      : `已击破 · ${Math.ceil(boss.respawn)} 秒后刷新`
  );
}
// 技能升级弹窗：每行展示旧值 → 新值与升级按钮（docs/02：面板展示旧/新值）。
export function renderSkillModal() {
  const modal = $("skillModal");
  if (modal.classList.contains("hidden")) return;
  const hero = activeHero();
  const points = state.player.skillPoints || 0;
  setText($("skillModalPoints"), `可用技能点：${points}`);
  setHtml(
    $("skillModalList"),
    hero.skills
      .map((skill, index) => {
        const level = state.player.skillLevels?.[index] || 0;
        const nextMultiplier = Math.round(skill.damage * (1 + SKILL_UPGRADE.multiplierPerLevel * (level + 1)) * 100);
        const nowMultiplier = Math.round(skill.damage * (1 + SKILL_UPGRADE.multiplierPerLevel * level) * 100);
        const maxed = level >= SKILL_UPGRADE.maxLevel;
        return (
          `<div class="skill-row">` +
          `<div class="skill-row-info"><strong>${skill.name}</strong><small>Lv.${level} · 倍率 ${nowMultiplier}%${maxed ? "" : ` → ${nextMultiplier}%`}</small><span>${skill.desc}</span></div>` +
          `<button class="link-button" data-upgrade-skill="${index}" ${maxed || points < 1 ? "disabled" : ""}>${maxed ? "已满级" : "升级（1 点）"}</button>` +
          `</div>`
        );
      })
      .join("")
  );
}

// 任务链（原型 v2，0.2.9）：两级状态机展示——当前任务卡（步骤/奖励/经验进度）
// + 当前章 10 个剧情节点三态（✓ 完成 / ◉ 当前 / ○ 未到）+ 章末承接提示。
// 状态由 questStatus / chapterStats 从 mapProgress 派生，奖励在通关时自动发放。
export function renderQuestChain() {
  const map = activeMap();
  const stats = chapterStats();
  const view = objectiveView();
  const progress = mapProgress();
  const signature = [
    "v2",
    map.chapter,
    stats.done,
    progress.kills,
    progress.need,
    progress.bossDefeated,
    progress.completed,
    progress.rewardClaimed,
    state.player.exp,
    state.currentMapId
  ].join("|");
  if (!panelChanged($("questChainList"), signature)) return;
  const chapterName = map.story.chapterTitle;
  setText($("questChainTitle"), `${chapterName} · 任务链`);
  setText($("questChainTip"), `${stats.done}/${stats.total} 完成`);
  const bossMark = progress.bossDefeated ? "首领已破" : progress.kills >= progress.need ? "前往首领" : "首领未破";
  const expText = `经验 ${state.player.exp}/${state.player.nextExp}（击杀可升级，本关上限 Lv.${Math.min(41, campaignGrowth(MAP_ORDER.filter((id) => state.mapProgress?.[id]?.completed).length).level + 1)}）`;
  const rewardText = progress.rewardClaimed
    ? `通关奖励已领：${QUEST_REWARD.gold} 金币 + ${QUEST_REWARD.marks} 首领印记`
    : `通关奖励：${QUEST_REWARD.gold} 金币 + ${QUEST_REWARD.marks} 首领印记`;
  const nextChapter = stats.complete ? (map.chapter < 10 ? `第 ${map.chapter + 1} 章已解锁` : "十章已全部完成") : "";
  const nodes = stats.ids
    .map((id, index) => {
      const entry = MAPS[id];
      const qs = questStatus(id);
      const mark = qs.completed ? "✓" : qs.status === "active" ? "◉" : "○";
      const cls = qs.completed ? "done" : qs.status === "active" ? "current" : "";
      return `<span class="quest-chain-node ${cls}" title="${entry.story.beatTitle}：${entry.story.summary}">${mark} ${entry.story.beatTitle}</span>`;
    })
    .join("");
  setHtml(
    $("questChainList"),
    `<div class="quest-current">
       <div class="qc-title">${view.complete ? "本关已完成" : `当前任务 · ${entryTitle()}`}</div>
       <div class="qc-goal">${view.complete ? "前往出口进入下一关" : `${view.text} · ${bossMark}`}</div>
       <div class="qc-reward">${rewardText} · ${expText}</div>
     </div>
     <div class="quest-chain-list">${nodes}</div>
     ${nextChapter ? `<div class="qc-chapter-done">${nextChapter}</div>` : ""}`
  );
}

// 当前关剧情节点标题（任务卡标题用，beatTitle 已含关号：如「001 · 异兆 · 灰烬村外」）。
function entryTitle() {
  const map = activeMap();
  return `${map.story.beatTitle} · ${map.name}`;
}

// 低等级进图确认弹层（替代 window.confirm；传 null / 空对象隐藏）。
export function renderTravelConfirm(pending = null) {
  const overlay = $("travelConfirm");
  const { exit, target } = pending || {};
  if (!exit || !target) {
    overlay.classList.add("hidden");
    return;
  }
  overlay.classList.remove("hidden");
  setText(
    $("travelConfirmText"),
    `即将进入 ${target.name}（推荐 Lv.${target.levelMin}-${target.levelMax}），你当前 Lv.${state.player.level}。危险等级：${target.dangerLabel}`
  );
}

export function renderAll() {
  if (!state) return;
  drawWorld();
  renderMapHeader();
  renderMapObjective();
  renderQuestChain();
  renderRegion();
  renderPlayer();
  renderTarget();
  renderNormalAttack();
  renderSkills();
  renderSkillModal();
  renderEquipment();
  renderInventory();
  renderShopPanel();
  renderLog();
  renderBoss();
  setText($("coords"), `坐标 ${Math.round(state.player.x)}, ${Math.round(state.player.y)}`);
  // 操作提示与弹窗说明跟随自定义键位，避免玩家改键后看到旧按键。
  setText(
    $("combatHint"),
    `WASD / 摇杆移动 · ${keyLabel("attack")} 普攻 · ${keyLabel("skill1")}-${keyLabel("skill4")} 技能 · ${keyLabel("pickup")} 拾取 · ${keyLabel("travel")} 前往目标出口 · 前进出口需完成当前关卡`
  );
  setText(
    $("skillModalTip"),
    `升级获得技能点；每级提高该技能倍率 +6%（原型简化，上限 10 级）。按 ${keyLabel("skillUpgrade")} 或点击右上角「技能」关闭。`
  );
  $("skillBtn").title = `技能升级（快捷键 ${keyLabel("skillUpgrade")}）`;
  $("potionBtn").title = `使用生命药水（快捷键 ${keyLabel("potion")}）`;
}

// 键位设置面板：只在打开弹窗 / 改键 / 重置时重建，静止帧不参与逐帧渲染。
export function renderKeybindPanel() {
  const capturing = keybindCapture.action;
  setHtml(
    $("keybindList"),
    KEYBIND_ACTIONS.map((action) => {
      const isCapturing = capturing === action.id;
      return (
        `<div class="keybind-row"><div class="keybind-row-info"><strong>${action.label}</strong><span>${action.hint}</span></div>` +
        `<button class="keybind-key${isCapturing ? " capturing" : ""}" data-keybind-action="${action.id}">${isCapturing ? "按任意键…" : keyLabel(action.id)}</button></div>`
      );
    }).join("")
  );
  setText($("settingsHint"), capturing ? "等待新的按键（Esc 取消）" : "点击右侧按键后再按新键");
}
