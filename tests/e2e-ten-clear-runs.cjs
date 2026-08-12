const { chromium } = require("playwright");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1&fast=1";
const FAST_RUN = new URL(BASE_URL).searchParams.has("fast");
let MAP_ORDER = [];
let MAP_NEEDS = {};
let SAFE_POINTS = {};
let SITE_POINTS = {};
let MAP_BOSS_PHASES = {};
const VALID_CLASSES = ["warrior", "mage", "taoist"];
const DEFAULT_CLASS_SEQUENCE = VALID_CLASSES;
const BASE_HP = { warrior: 350, mage: 235, taoist: 280 };
const requestedClasses = (process.env.ONEKNIFE_CLASSES || "").split(",").map((value) => value.trim()).filter(Boolean);
const totalRunsValue = process.env.ONEKNIFE_RUNS === undefined ? (requestedClasses.length || 1) : Number(process.env.ONEKNIFE_RUNS);
const TOTAL_RUNS = totalRunsValue;
const CONCURRENCY = Number(process.env.ONEKNIFE_CONCURRENCY || Math.min(3, TOTAL_RUNS));

if (!Number.isInteger(TOTAL_RUNS) || TOTAL_RUNS < 1) throw new Error(`ONEKNIFE_RUNS 必须是大于 0 的整数，实际为 ${process.env.ONEKNIFE_RUNS}`);
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 3) throw new Error(`ONEKNIFE_CONCURRENCY 必须是 1-3，实际为 ${process.env.ONEKNIFE_CONCURRENCY}`);
if (requestedClasses.some((classId) => !VALID_CLASSES.includes(classId))) throw new Error(`ONEKNIFE_CLASSES 包含未知职业：${requestedClasses.join(",")}`);
const CLASS_SEQUENCE = requestedClasses.length ? requestedClasses : DEFAULT_CLASS_SEQUENCE;

function classForRun(runIndex) {
  return CLASS_SEQUENCE[runIndex % CLASS_SEQUENCE.length];
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function cubicPoint(startX, startY, control1X, control1Y, control2X, control2Y, endX, endY, t) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * startX + 3 * inverse ** 2 * t * control1X + 3 * inverse * t ** 2 * control2X + t ** 3 * endX,
    y: inverse ** 3 * startY + 3 * inverse ** 2 * t * control1Y + 3 * inverse * t ** 2 * control2Y + t ** 3 * endY
  };
}

function distanceToPath(point, path) {
  if (!Array.isArray(path)) return Infinity;
  let best = Infinity;
  [[0, 2, 4, 6], [6, 8, 10, 12]].forEach(([start, control1, control2, end]) => {
    if (path[end] === undefined) return;
    for (let step = 0; step <= 24; step += 1) {
      const sample = cubicPoint(path[start], path[start + 1], path[control1], path[control1 + 1], path[control2], path[control2 + 1], path[end], path[end + 1], step / 24);
      best = Math.min(best, Math.hypot(point.x - sample.x, point.y - sample.y));
    }
  });
  return best;
}

async function snapshot(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__?.snapshot());
}

function expectedGrowth(clearedMaps) {
  if (clearedMaps <= 10) return { level: 1 + clearedMaps, exp: 0 };
  if (clearedMaps <= 30) return { level: 11 + Math.floor((clearedMaps - 10) / 2), exp: ((clearedMaps - 10) % 2) * 50 };
  if (clearedMaps <= 60) return { level: 21 + Math.floor((clearedMaps - 30) / 3), exp: Math.floor(((clearedMaps - 30) % 3) * 100 / 3) };
  return { level: 31 + Math.floor((clearedMaps - 60) / 4), exp: ((clearedMaps - 60) % 4) * 25 };
}

async function advance(page, milliseconds) {
  await page.clock.runFor(milliseconds);
}

async function canvasGeometry(page, worldPoint) {
  const snap = await snapshot(page);
  const rect = await page.locator("#gameCanvas").boundingBox();
  const scale = Math.min(rect.width / 940, rect.height / 590);
  const halfW = rect.width / scale / 2;
  const halfH = rect.height / scale / 2;
  const cameraX = clamp(snap.player.x - halfW, 0, 2400 - halfW * 2);
  const cameraY = clamp(snap.player.y - halfH, 0, 1500 - halfH * 2);
  return { snap, rect, x: rect.x + (worldPoint.x - cameraX) * scale, y: rect.y + (worldPoint.y - cameraY) * scale };
}

async function moveEntityIntoView(page, entityId, expectedMap) {
  let lastGeometry = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId !== expectedMap) return false;
    const entity = snap.entities.find((item) => item.id === entityId && item.alive);
    if (!entity) return false;
    const geometry = await canvasGeometry(page, entity);
    lastGeometry = { player: snap.player, entity, rect: geometry.rect, screen: { x: geometry.x, y: geometry.y } };
    const margin = 35;
    if (Math.hypot(entity.x - snap.player.x, entity.y - snap.player.y) <= 280 && geometry.x > geometry.rect.x + margin && geometry.x < geometry.rect.x + geometry.rect.width - margin && geometry.y > geometry.rect.y + margin && geometry.y < geometry.rect.y + geometry.rect.height - margin) return true;
    const dx = entity.x - snap.player.x;
    const dy = entity.y - snap.player.y;
    const horizontalKey = dx < 0 ? "a" : "d";
    const verticalKey = dy < 0 ? "w" : "s";
    const key = Math.abs(dx) > Math.abs(dy) * .45 ? horizontalKey : verticalKey;
    await page.keyboard.down(key);
    await advance(page, 520);
    await page.keyboard.up(key);
  }
  throw new Error(`无法把目标 ${entityId} 移入视野：${JSON.stringify(lastGeometry)}`);
}

async function moveToPoint(page, point, expectedMap, radius = 54) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const geometry = await canvasGeometry(page, point);
    if (geometry.snap.currentMapId !== expectedMap) return false;
    if (Math.hypot(point.x - geometry.snap.player.x, point.y - geometry.snap.player.y) <= radius) return true;
    const margin = 42;
    if (geometry.x < geometry.rect.x + margin || geometry.x > geometry.rect.x + geometry.rect.width - margin || geometry.y < geometry.rect.y + margin || geometry.y > geometry.rect.y + geometry.rect.height - margin) {
      const dx = point.x - geometry.snap.player.x;
      const dy = point.y - geometry.snap.player.y;
      const key = Math.abs(dx) > Math.abs(dy) * .45 ? (dx < 0 ? "a" : "d") : (dy < 0 ? "w" : "s");
      await page.keyboard.down(key);
      await advance(page, 720);
      await page.keyboard.up(key);
      continue;
    }
    await page.mouse.click(geometry.x, geometry.y);
    const distance = Math.hypot(point.x - geometry.snap.player.x, point.y - geometry.snap.player.y);
    await advance(page, Math.max(420, Math.min(1800, distance / 190 * 1000 + 240)));
  }
  return false;
}

async function returnToMap(page, mapId) {
  for (let guard = 0; guard < 5; guard += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId === mapId) return;
    if (MAP_ORDER.indexOf(snap.currentMapId) > MAP_ORDER.indexOf(mapId)) throw new Error(`角色被送到目标地图之后：${snap.currentMapId}`);
    await page.keyboard.press("t");
    await advance(page, 200);
  }
  throw new Error(`死亡后无法返回 ${mapId}`);
}

async function defeatEntity(page, entityId, mapId) {
  const isBoss = entityId.startsWith("boss-");
  const observedPhases = new Set();
  let hazardObserved = false;
  const assertBossMechanics = () => {
    if (!isBoss) return;
    const expectedPhases = MAP_BOSS_PHASES[mapId];
    const missingPhases = Array.from({ length: expectedPhases }, (_, index) => index + 1).filter((phase) => !observedPhases.has(phase));
    if (missingPhases.length) throw new Error(`${mapId} Boss 未经历阶段 ${missingPhases.join(",")}；已观察 ${[...observedPhases].join(",")}`);
    if (expectedPhases >= 2 && !hazardObserved) throw new Error(`${mapId} Boss 未生成危险技能`);
  };
  for (let guard = 0; guard < 1400; guard += 1) {
    let snap = await snapshot(page);
    if (snap.currentMapId !== mapId) {
      await returnToMap(page, mapId);
      continue;
    }
    const entity = snap.entities.find((item) => item.id === entityId);
    if (entity?.boss && entity.alive) observedPhases.add(entity.phase);
    if (snap.hazardsSpawned > 0) hazardObserved = true;
    if (isBoss && guard % 100 === 0) process.stdout.write(`FIGHT ${entityId} guard=${guard} hp=${entity ? Math.ceil(entity.hp) : "gone"} player=${Math.ceil(snap.player.hp)} poison=${snap.player.poison} pos=${Math.round(snap.player.x)},${Math.round(snap.player.y)}\n`);
    if (!entity || !entity.alive) {
      if (isBoss && !snap.progress[mapId]?.bossDefeated) {
        await advance(page, 1000);
        continue;
      }
      assertBossMechanics();
      return;
    }
    const movedIntoView = await moveEntityIntoView(page, entityId, mapId);
    if (!movedIntoView) continue;
    snap = await snapshot(page);
    if (snap.currentMapId !== mapId) continue;
    const current = snap.entities.find((item) => item.id === entityId && item.alive);
    if (!current) {
      if (isBoss && !snap.progress[mapId]?.bossDefeated) continue;
      assertBossMechanics();
      return;
    }
    const safePoint = SAFE_POINTS[mapId];
    const nearSafePoint = Math.hypot(snap.player.x - safePoint.x, snap.player.y - safePoint.y) <= 54;
    const maxHp = BASE_HP[snap.classId] + snap.player.level * 18;
    const needsRecovery = FAST_RUN ? snap.player.poison >= 4 || snap.player.hp < maxHp * .45 : snap.player.poison >= 2 || snap.player.hp < maxHp * .85;
    if (current.boss && !nearSafePoint && needsRecovery) {
      const reachedSanctuary = await moveToPoint(page, safePoint, mapId);
      if (reachedSanctuary) {
        await advance(page, 1800);
        continue;
      }
    }
    const geometry = await canvasGeometry(page, current);
    await page.mouse.click(geometry.x, geometry.y);
    if (current.boss) {
      const bossActions = ["j", "1", "2", "4", "r"];
      await page.keyboard.press(bossActions[guard % bossActions.length]);
    } else await page.keyboard.press("j");
    const baseHp = { warrior: 350, mage: 235, taoist: 280 }[snap.classId] || 280;
    if (current.boss && guard % 12 === 0 && snap.player.hp < baseHp + snap.player.level * 18 * .75) await page.keyboard.press("q");
    await page.keyboard.press("f");
    const attackRange = { warrior: 70, mage: 220, taoist: 185 }[snap.classId] || 160;
    const inAttackRange = Math.hypot(current.x - snap.player.x, current.y - snap.player.y) <= attackRange + 18;
    if (current.boss && inAttackRange && !FAST_RUN) {
      const dx = current.x - snap.player.x;
      const dy = current.y - snap.player.y;
      const key = Math.abs(dx) > Math.abs(dy) * .45 ? (dx < 0 ? "a" : "d") : (dy < 0 ? "w" : "s");
      await page.keyboard.down(key);
      await advance(page, 620);
      await page.keyboard.up(key);
    } else await advance(page, current.boss ? 420 : 650);
  }
  throw new Error(`击败 ${entityId} 超时：${JSON.stringify(await snapshot(page))}`);
}

async function clearMap(page, mapId) {
  process.stdout.write(`START ${mapId}\n`);
  await returnToMap(page, mapId);
  let snap = await snapshot(page);
  if (process.env.ONEKNIFE_ACTIVATE_SITES === "1" && !snap.progress[mapId]?.siteClaimed) {
    const site = SITE_POINTS[mapId];
    if (!site || !await moveToPoint(page, site, mapId, 48)) throw new Error("无法抵达 " + mapId + " 场景交互节点");
    await page.keyboard.press("f");
    await advance(page, 160);
    snap = await snapshot(page);
    if (!snap.progress[mapId]?.siteClaimed) throw new Error("场景交互节点未激活：" + mapId);
  }
  while ((snap.progress[mapId]?.kills || 0) < MAP_NEEDS[mapId]) {
    const target = snap.entities.find((entity) => entity.alive && !entity.boss);
    if (!target) { await advance(page, 12000); snap = await snapshot(page); continue; }
    await defeatEntity(page, target.id, mapId);
    snap = await snapshot(page);
  }
  const boss = snap.entities.find((entity) => entity.alive && entity.boss);
  process.stdout.write(`BOSS ${mapId} hp=${boss ? Math.ceil(boss.hp) : "gone"} lv=${snap.player.level} hpPlayer=${Math.ceil(snap.player.hp)} poison=${snap.player.poison}\n`);
  if (snap.progress[mapId]?.bossDefeated || !boss) throw new Error(`${mapId} Boss 在清怪阶段被提前击杀`);
  await defeatEntity(page, boss.id, mapId);
  snap = await snapshot(page);
  if (!snap.progress[mapId]?.completed) throw new Error(`${mapId} 未进入完成状态：${JSON.stringify(snap)}`);
}

async function assertAutoSaveCheckpoint(page, mapId) {
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("oneknife999-prototype-save-v3") || "null"));
  if (!saved?.mapProgress?.[mapId]?.completed) throw new Error(`${mapId} 通关后未自动保存：${JSON.stringify(saved?.mapProgress?.[mapId])}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await advance(page, 200);
  const restored = await snapshot(page);
  if (restored?.currentMapId !== mapId || !restored.progress?.[mapId]?.completed) throw new Error(`${mapId} 刷新后未恢复通关进度：${JSON.stringify(restored)}`);
  const clearedMaps = MAP_ORDER.indexOf(mapId) + 1;
  const expected = expectedGrowth(clearedMaps);
  if (restored.player.level !== expected.level || restored.player.exp !== expected.exp || restored.player.nextExp !== 100) throw new Error(`${mapId} 成长节奏错误：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(restored.player)}`);
  process.stdout.write(`CHECKPOINT ${String(clearedMaps).padStart(3, "0")}/100 ${mapId} Lv.${restored.player.level} ${restored.player.exp}/100 SAVED+RESTORED\n`);
}

async function runJourney(browser, runIndex) {
  const classId = classForRun(runIndex);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__?.catalog());
  if (!Array.isArray(catalog) || catalog.length !== 100) throw new Error(`地图目录数量错误：${catalog?.length}`);
  if (new Set(catalog.map((entry) => entry.id)).size !== 100) throw new Error("地图 ID 不唯一");
  if (new Set(catalog.map((entry) => entry.layoutId)).size !== 100) throw new Error("地图布局签名不唯一");
  if (new Set(catalog.map((entry) => entry.layoutSignature)).size !== 100) throw new Error("地图实际构图重复");
  if (new Set(catalog.slice(4).map((entry) => entry.siteArchetype)).size !== 10 || new Set(catalog.slice(4).map((entry) => entry.sitePoint?.effect)).size !== 10 || catalog.some((entry) => !entry.siteDetail)) throw new Error("地图场所母题或交互效果缺失");
  if (catalog.slice(4).some((entry) => entry.monsterProfiles.some((monster) => !monster.intro || !Array.isArray(monster.skills) || monster.skills.length < 2 || monster.intro.includes("游荡在当前区域")))) throw new Error("后期普通怪资料缺失");
  if (catalog.some((entry) => !Array.isArray(entry.tacticalPoints) || entry.tacticalPoints.length !== 3 || entry.tacticalPoints.filter((point) => point.kind === "rest").length !== 1 || entry.tacticalPoints.filter((point) => point.kind === "resource").length !== 1 || entry.tacticalPoints.filter((point) => point.kind === "site").length !== 1 || entry.tacticalPoints.some((point) => !point.name || !point.detail || point.radius < 50) || !entry.sitePoint?.effect)) throw new Error("地图战术节点缺失或字段不完整");
  for (const entry of catalog) {
    const tacticalPoints = entry.tacticalPoints;
    const distanceTo = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    for (let index = 0; index < tacticalPoints.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < tacticalPoints.length; otherIndex += 1) {
        const a = tacticalPoints[index];
        const b = tacticalPoints[otherIndex];
        if (distanceTo(a, b) < a.radius + b.radius + 18) throw new Error(`地图节点交互范围重叠：${entry.id}/${a.kind}/${b.kind}`);
      }
    }
    if (!entry.bossPoint || !Array.isArray(entry.monsterSpawns)) throw new Error(`地图几何目录缺失：${entry.id}`);
    for (const point of tacticalPoints) {
      if (distanceTo(point, entry.bossPoint) < point.radius + entry.bossPoint.radius + 100) throw new Error(`节点过近首领战区：${entry.id}/${point.kind}`);
      if (entry.monsterSpawns.some((spawn) => distanceTo(point, spawn) < point.radius + 82)) throw new Error(`节点过近怪物刷新点：${entry.id}/${point.kind}`);
      if (entry.specialRect && point.x >= entry.specialRect.x - 78 && point.x <= entry.specialRect.x + entry.specialRect.w + 78 && point.y >= entry.specialRect.y - 78 && point.y <= entry.specialRect.y + entry.specialRect.h + 78) throw new Error(`节点落入首领特殊战区：${entry.id}/${point.kind}`);
    }
  }
  const roadRules = { direct: { pathCount: 1 }, fork: { pathCount: 2 }, zigzag: { pathCount: 1, minTurns: 2 }, radial: { pathCount: 2 } };
  for (const entry of catalog.slice(4)) {
    const expected = roadRules[entry.road];
    if (!expected || entry.pathCount !== expected.pathCount || (expected.minTurns && entry.pathTurnCount < expected.minTurns)) throw new Error(`地图道路几何不符合 ${entry.id}：${JSON.stringify(entry)}`);
    if (entry.road === "fork" || entry.road === "radial") {
      const branchReward = entry.tacticalPoints.find((point) => point.kind === "resource" && point.route === "branch");
      if (!branchReward || !entry.branchPath || distanceToPath(branchReward, entry.branchPath) > 138) throw new Error(`地图支路没有可获得的路线收益：${entry.id}`);
    } else if (entry.tacticalPoints.some((point) => point.route === "branch")) throw new Error(`非分支地图错误标记支路收益：${entry.id}`);
  }
  if (new Set(catalog.map((entry) => entry.storyBeat)).size !== 100 || catalog.some((entry) => !entry.storyObjective)) throw new Error("百图剧情节点缺失或重复");
  MAP_ORDER = catalog.map((entry) => entry.id);
  MAP_NEEDS = Object.fromEntries(catalog.map((entry) => [entry.id, entry.need]));
  SAFE_POINTS = Object.fromEntries(catalog.map((entry) => [entry.id, entry.safePoint]));
  SITE_POINTS = Object.fromEntries(catalog.map((entry) => [entry.id, entry.sitePoint]));
  MAP_BOSS_PHASES = Object.fromEntries(catalog.map((entry) => [entry.id, entry.bossPhases]));
  await page.locator(`[data-class="${classId}"]`).click();
  await advance(page, 200);

  const firstMap = catalog.find((entry) => entry.id === MAP_ORDER[0]);
  const cache = firstMap.tacticalPoints.find((point) => point.kind === "resource");
  if (!await moveToPoint(page, cache, MAP_ORDER[0], 48)) throw new Error("无法抵达首张地图秘藏补给箱");
  await page.keyboard.press("f");
  await advance(page, 160);
  const cacheSnapshot = await snapshot(page);
  if (!cacheSnapshot.progress[MAP_ORDER[0]]?.resourceClaimed) throw new Error(`秘藏补给箱未完成一次性搜索：${JSON.stringify(cacheSnapshot)}`);
  const cacheSave = await page.evaluate(() => JSON.parse(localStorage.getItem("oneknife999-prototype-save-v3") || "null"));
  if (!cacheSave?.mapProgress?.[MAP_ORDER[0]]?.resourceClaimed) throw new Error("秘藏搜索结果未自动保存");
  const site = firstMap.tacticalPoints.find((point) => point.kind === "site");
  if (!await moveToPoint(page, site, MAP_ORDER[0], 48)) throw new Error("无法抵达首张地图场景交互节点");
  await page.keyboard.press("f");
  await advance(page, 160);
  const siteSnapshot = await snapshot(page);
  if (!siteSnapshot.progress[MAP_ORDER[0]]?.siteClaimed || !siteSnapshot.logs.some((message) => message.includes("已激活"))) throw new Error("场景交互节点未生效：" + JSON.stringify(siteSnapshot));
  const siteSave = await page.evaluate(() => JSON.parse(localStorage.getItem("oneknife999-prototype-save-v3") || "null"));
  if (!siteSave?.mapProgress?.[MAP_ORDER[0]]?.siteClaimed) throw new Error("场景交互节点未自动保存");
  const claimedCharge = siteSnapshot.player.charge;
  await page.keyboard.press("f");
  await advance(page, 160);
  const repeatedSiteSnapshot = await snapshot(page);
  if (repeatedSiteSnapshot.player.charge !== claimedCharge || !repeatedSiteSnapshot.logs.some((message) => message.includes("已经激活过"))) throw new Error("重复激活场景节点发生重复结算：" + JSON.stringify(repeatedSiteSnapshot));

  await page.keyboard.press("t");
  await advance(page, 200);
  if ((await snapshot(page)).currentMapId !== "ash_outskirts") throw new Error("未通关时前进出口未被拦截");

  for (let mapIndex = 0; mapIndex < MAP_ORDER.length; mapIndex += 1) {
    const mapId = MAP_ORDER[mapIndex];
    await clearMap(page, mapId);
    await assertAutoSaveCheckpoint(page, mapId);
    if (mapIndex < MAP_ORDER.length - 1) {
      await page.keyboard.press("t");
      await advance(page, 250);
      const next = await snapshot(page);
      if (next.currentMapId !== MAP_ORDER[mapIndex + 1]) throw new Error(`${mapId} 通关后未进入下一地图`);
    }
  }

  const title = await page.locator("#mapObjectiveTitle").textContent();
  const state = await page.locator("#mapObjectiveState").textContent();
  const finalSnap = await snapshot(page);
  if (title !== "百图征途已通关" || state !== "全部完成") throw new Error(`最终结算文案错误：${state}/${title}`);
  if (finalSnap.player.level !== 41 || finalSnap.stageNumber !== 100) throw new Error(`最终成长错误：${JSON.stringify(finalSnap)}`);
  if (errors.length) throw new Error(`页面异常：${errors.join(" | ")}`);
  await context.close();
  return { run: runIndex + 1, classId, level: finalSnap.player.level, maps: MAP_ORDER.length, result: "PASS" };
}

async function assertLegacyMigration(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("oneknife999-prototype-save-v3");
    localStorage.setItem("oneknife999-prototype-save-v2", JSON.stringify({
      classId: "warrior",
      currentMapId: "red_sand_desert",
      player: { x: 180, y: 1120, level: 16, exp: 0, nextExp: 500, gold: 999, marks: 100, potion: 8 },
      inventory: [],
      equipment: {},
      mapProgress: {
        ash_outskirts: { kills: 8, bossDefeated: true, completed: true, rewardClaimed: true },
        pine_forest: { kills: 10, bossDefeated: true, completed: true, rewardClaimed: true },
        black_rock_mine: { kills: 10, bossDefeated: true, completed: true, rewardClaimed: true },
        red_sand_desert: { kills: 10, bossDefeated: true, completed: true, rewardClaimed: true }
      }
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await advance(page, 200);
  const snap = await snapshot(page);
  const stored = await page.evaluate(() => ({
    v2: localStorage.getItem("oneknife999-prototype-save-v2"),
    v3: JSON.parse(localStorage.getItem("oneknife999-prototype-save-v3") || "null")
  }));
  if (snap?.currentMapId !== "red_sand_desert" || snap.player.level !== 16 || !snap.progress.red_sand_desert?.completed) throw new Error(`v2 迁移状态错误：${JSON.stringify(snap)}`);
  if (!stored.v2 || stored.v3?.saveVersion !== 3 || stored.v3?.player?.migrationLevelFloor !== 16) throw new Error(`v2 迁移存储错误：${JSON.stringify(stored)}`);
  process.stdout.write("MIGRATION v2->v3 SAVED+RESTORED\n");
  await page.locator("#resetBtn").click();
  const resetStorage = await page.evaluate(() => ({
    v2: localStorage.getItem("oneknife999-prototype-save-v2"),
    v3: localStorage.getItem("oneknife999-prototype-save-v3")
  }));
  if (resetStorage.v2 || resetStorage.v3) throw new Error(`重置后旧存档仍存在：${JSON.stringify(resetStorage)}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await advance(page, 200);
  if (await snapshot(page)) throw new Error(`重置后刷新不应自动恢复存档：${JSON.stringify(await snapshot(page))}`);
  process.stdout.write("RESET v2+v3 CLEARED+RESTORED\n");
  await context.close();
}

async function assertAssetAutosave(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("oneknife999-prototype-save-v3", JSON.stringify({
      saveVersion: 3,
      classId: "warrior",
      currentMapId: "ash_outskirts",
      player: { x: 480, y: 780, level: 1, exp: 0, nextExp: 100, gold: 40, marks: 0, potion: 3, equipment: { weapon: null, neck: null, boots: null } },
      inventory: [{ id: "asset-test-weapon", name: "测试矿刃", slot: "weapon", quality: "blue", glyph: "刃", power: 12, value: 20, color: "#78b6ec", desc: "资产保存回归" }],
      equipment: { weapon: null, neck: null, boots: null },
      mapProgress: {}
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await advance(page, 200);
  // 背包每帧会随角色状态重绘，使用当前 DOM 节点触发真实 click 事件，
  // 避免 Playwright 在 actionability 检查期间拿到已被下一帧替换的节点。
  await page.evaluate(() => {
    const item = document.querySelector('#inventoryGrid [data-item-index="0"]');
    if (!item) throw new Error("装备测试物品未渲染");
    item.click();
  });
  await advance(page, 100);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("oneknife999-prototype-save-v3") || "null"));
  if (saved?.player?.equipment?.weapon?.id !== "asset-test-weapon" || saved.inventory?.length !== 0) throw new Error(`装备变更未自动保存：${JSON.stringify(saved)}`);
  process.stdout.write("ASSET EQUIP SAVED+RESTORED\n");
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    await assertLegacyMigration(browser);
    await assertAssetAutosave(browser);
    for (let offset = 0; offset < TOTAL_RUNS; offset += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, TOTAL_RUNS - offset) }, (_, index) => runJourney(browser, offset + index));
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
      for (const result of batchResults) process.stdout.write(`RUN ${result.run}/${TOTAL_RUNS} ${result.classId} Lv.${result.level}: ${result.result}\n`);
    }
    process.stdout.write(`ALL ${results.length}/${TOTAL_RUNS} JOURNEYS PASSED\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
