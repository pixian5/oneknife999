// 0.8.31 回归：深层模式下按 T 必须进入下一层，而不是回到主线下一图。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const ROOT = (process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1").split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";

const emptySlots = () => ({
  weapon: null,
  helmet: null,
  neck: null,
  armor: null,
  braceletL: null,
  braceletR: null,
  ringL: null,
  ringR: null,
  belt: null,
  boots: null,
  medal: null,
  talisman: null
});

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });

  // 用 catalog 生成「百图已通关」存档：enterAbyss 要求 clearedMaps >= 100。
  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
  const mapProgress = {};
  for (const entry of catalog)
    mapProgress[entry.id] = { kills: entry.need, need: entry.need, bossDefeated: true, completed: true, rewardClaimed: true };

  const save = {
    saveVersion: 4,
    classId: "warrior",
    currentMapId: catalog[0].id,
    player: {
      x: 480,
      y: 780,
      hp: 9999,
      resource: 100,
      level: 41,
      exp: 0,
      nextExp: 100,
      gold: 0,
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
      equipment: emptySlots(),
      poison: 0,
      skillPoints: 0,
      skillLevels: [0, 0, 0, 0],
      sin: 0,
      visitedMaps: { [catalog[0].id]: true }
    },
    inventory: [],
    equipment: emptySlots(),
    mapProgress,
    abyssFloor: 1,
    abyssBest: 1
  };

  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });
  await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });

  // snapshot 不暴露 abyssFloor，改为直接读存档里的层数与当前地图。
  const before = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4") || "{}");
    const s = window.__ONEKNIFE_E2E__.snapshot();
    return { floor: save.abyssFloor, map: s.currentMapId };
  });
  assert.equal(before.floor, 1, `存档应恢复到第 1 层，实际 ${before.floor}`);

  await page.keyboard.press("t");
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4") || "{}");
    const s = window.__ONEKNIFE_E2E__.snapshot();
    return { floor: save.abyssFloor ?? s.abyssFloor, map: s.currentMapId, best: save.abyssBest };
  });
  assert.equal(after.map, catalog[(2 * 37) % catalog.length].id, `第 2 层地形应为确定性映射，实际 ${after.map}`);
  assert.notEqual(after.map, before.map, "按 T 后地图必须变化");

  assert.deepEqual(errors, [], `页面异常：${errors.join(" | ")}`);
  process.stdout.write(`ABYSS TRAVEL PASS ${before.map} → ${after.map}（第 2 层确定性地形）\n`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
