const { chromium } = require("playwright");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1&fast=1";
let MAP_ORDER = [];
let MAP_NEEDS = {};
let SAFE_POINTS = {};
const CLASSES = ["warrior", "mage", "taoist", "warrior", "mage", "taoist", "warrior", "mage", "taoist", "warrior"];
const BASE_HP = { warrior: 350, mage: 235, taoist: 280 };
const TOTAL_RUNS = Number(process.env.ONEKNIFE_RUNS || 1);

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

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
  for (let guard = 0; guard < 1400; guard += 1) {
    let snap = await snapshot(page);
    if (snap.currentMapId !== mapId) {
      await returnToMap(page, mapId);
      continue;
    }
    const entity = snap.entities.find((item) => item.id === entityId);
    if (entityId.startsWith("boss-") && guard % 100 === 0) process.stdout.write(`FIGHT ${entityId} guard=${guard} hp=${entity ? Math.ceil(entity.hp) : "gone"} player=${Math.ceil(snap.player.hp)} poison=${snap.player.poison} pos=${Math.round(snap.player.x)},${Math.round(snap.player.y)}\n`);
    if (!entity || !entity.alive) {
      if (entityId.startsWith("boss-") && !snap.progress[mapId]?.bossDefeated) {
        await advance(page, 1000);
        continue;
      }
      return;
    }
    const movedIntoView = await moveEntityIntoView(page, entityId, mapId);
    if (!movedIntoView) continue;
    snap = await snapshot(page);
    if (snap.currentMapId !== mapId) continue;
    const current = snap.entities.find((item) => item.id === entityId && item.alive);
    if (!current) {
      if (entityId.startsWith("boss-") && !snap.progress[mapId]?.bossDefeated) continue;
      return;
    }
    const safePoint = SAFE_POINTS[mapId];
    const nearSafePoint = Math.hypot(snap.player.x - safePoint.x, snap.player.y - safePoint.y) <= 54;
    const maxHp = BASE_HP[snap.classId] + snap.player.level * 18;
    if (current.boss && !nearSafePoint && (snap.player.poison >= 2 || snap.player.hp < maxHp * .85)) {
      const reachedSanctuary = await moveToPoint(page, safePoint, mapId);
      if (reachedSanctuary) {
        await advance(page, 1800);
        continue;
      }
    }
    const geometry = await canvasGeometry(page, current);
    await page.mouse.click(geometry.x, geometry.y);
    await page.keyboard.press("j");
    await page.keyboard.press("1");
    await page.keyboard.press("2");
    await page.keyboard.press("3");
    await page.keyboard.press("4");
    await page.keyboard.press("r");
    const baseHp = { warrior: 350, mage: 235, taoist: 280 }[snap.classId] || 280;
    if (current.boss && guard % 12 === 0 && snap.player.hp < baseHp + snap.player.level * 18 * .75) await page.keyboard.press("q");
    await page.keyboard.press("f");
    const attackRange = { warrior: 70, mage: 220, taoist: 185 }[snap.classId] || 160;
    const inAttackRange = Math.hypot(current.x - snap.player.x, current.y - snap.player.y) <= attackRange + 18;
    if (current.boss && inAttackRange) {
      const dx = current.x - snap.player.x;
      const dy = current.y - snap.player.y;
      const key = Math.abs(dx) > Math.abs(dy) * .45 ? (dx < 0 ? "a" : "d") : (dy < 0 ? "w" : "s");
      await page.keyboard.down(key);
      await advance(page, 620);
      await page.keyboard.up(key);
    } else await advance(page, current.boss ? 300 : 650);
  }
  throw new Error(`击败 ${entityId} 超时：${JSON.stringify(await snapshot(page))}`);
}

async function clearMap(page, mapId) {
  process.stdout.write(`START ${mapId}\n`);
  await returnToMap(page, mapId);
  let snap = await snapshot(page);
  while ((snap.progress[mapId]?.kills || 0) < MAP_NEEDS[mapId]) {
    const target = snap.entities.find((entity) => entity.alive && !entity.boss);
    if (!target) { await advance(page, 12000); snap = await snapshot(page); continue; }
    await defeatEntity(page, target.id, mapId);
    snap = await snapshot(page);
  }
  const boss = snap.entities.find((entity) => entity.alive && entity.boss);
  process.stdout.write(`BOSS ${mapId} hp=${boss ? Math.ceil(boss.hp) : "gone"} lv=${snap.player.level} hpPlayer=${Math.ceil(snap.player.hp)} poison=${snap.player.poison}\n`);
  if (!snap.progress[mapId]?.bossDefeated && boss) await defeatEntity(page, boss.id, mapId);
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__?.catalog());
  if (!Array.isArray(catalog) || catalog.length !== 100) throw new Error(`地图目录数量错误：${catalog?.length}`);
  MAP_ORDER = catalog.map((entry) => entry.id);
  MAP_NEEDS = Object.fromEntries(catalog.map((entry) => [entry.id, entry.need]));
  SAFE_POINTS = Object.fromEntries(catalog.map((entry) => [entry.id, entry.safePoint]));
  await page.locator(`[data-class="${CLASSES[runIndex]}"]`).click();
  await advance(page, 200);

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
  return { run: runIndex + 1, classId: CLASSES[runIndex], level: finalSnap.player.level, maps: MAP_ORDER.length, result: "PASS" };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const concurrency = Math.min(2, TOTAL_RUNS);
    for (let offset = 0; offset < TOTAL_RUNS; offset += concurrency) {
      const batch = Array.from({ length: Math.min(concurrency, TOTAL_RUNS - offset) }, (_, index) => runJourney(browser, offset + index));
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
      for (const result of batchResults) process.stdout.write(`RUN ${result.run}/${TOTAL_RUNS} ${result.classId} Lv.${result.level}: ${result.result}\n`);
    }
    process.stdout.write(`ALL ${results.length}/${TOTAL_RUNS} JOURNEYS PASSED\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
