// 0.8.33 回归（设计稿 docs/20261117-1010 回归 8-10）：深层程序化地形在真实浏览器里的行为。
// 8) 通关百图后 T 进入 F1：新地图命名 + 无出口错位；9) 深层刷新恢复原层；10) 首领层锁层与解锁。
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

  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
  const cleared = {};
  for (const entry of catalog)
    cleared[entry.id] = { kills: entry.need, need: entry.need, bossDefeated: true, completed: true, rewardClaimed: true };

  const buildSave = (extra = {}) => ({
    saveVersion: 4,
    classId: "warrior",
    currentMapId: catalog[catalog.length - 1].id,
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
      potion: 9,
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
    mapProgress: cleared,
    abyssFloor: 0,
    abyssBest: 0,
    ...extra
  });
  const inject = (save) =>
    page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });
  const load = async () => {
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
  };
  const state = () =>
    page.evaluate(() => {
      const snap = window.__ONEKNIFE_E2E__.snapshot();
      const save = JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4") || "{}");
      return { map: snap.currentMapId, title: document.getElementById("mapTitle")?.textContent || "", floor: save.abyssFloor };
    });

  // ===== 回归 8：通关百图 → T 进入程序化 F1 =====
  await inject(buildSave());
  await load();
  await page.keyboard.press("t");
  await page.waitForTimeout(600);
  let st = await state();
  assert.equal(st.map, "abyss-F1", `T 应进入程序化深层 F1，实际 ${st.map}`);
  assert.ok(st.title.includes("深层"), `地图标题应含「深层」，实际「${st.title}」`);
  assert.equal(st.floor, 1, "abyssFloor 应推进到 1");
  console.log("回归8 PASS：T 进入程序化 F1（" + st.title + "）");

  // ===== 回归 9：深层内刷新 → 仍在原层 =====
  await load();
  st = await state();
  assert.equal(st.map, "abyss-F1", `刷新后应恢复到 abyss-F1（前缀重建），实际 ${st.map}`);
  assert.ok(st.title.includes("深层"), `刷新后标题仍为深层，实际「${st.title}」`);
  console.log("回归9 PASS：深层刷新恢复原层（abyss-F1）");

  // ===== 回归 10：首领层锁层与解锁 =====
  // 10a) 停在 F10（首领层）、首领未杀 → T 被拦截
  const bossFloorProgress = { ...cleared, "abyss-F10": { kills: 0, need: 5, bossDefeated: false, completed: false } };
  await inject(buildSave({ currentMapId: "abyss-F10", mapProgress: bossFloorProgress, abyssFloor: 10, abyssBest: 10 }));
  await load();
  st = await state();
  assert.equal(st.map, "abyss-F10", `F10 档应恢复到深渊第 10 层，实际 ${st.map}`);
  await page.keyboard.press("t");
  await page.waitForTimeout(500);
  st = await state();
  assert.equal(st.map, "abyss-F10", `首领未杀时 T 不得深入，实际 ${st.map}`);
  const toast = await page.evaluate(() => document.getElementById("toast")?.textContent || "");
  assert.ok(toast.includes("首领层"), `应提示首领层锁层，实际「${toast}」`);
  console.log("回归10a PASS：首领层未杀被拦截（提示：「" + toast + "」）");

  // 10b) 首领已杀 → T 深入 F11
  await inject(
    buildSave({
      currentMapId: "abyss-F10",
      mapProgress: { ...cleared, "abyss-F10": { kills: 5, need: 5, bossDefeated: true, completed: false } },
      abyssFloor: 10,
      abyssBest: 10
    })
  );
  await load();
  await page.keyboard.press("t");
  await page.waitForTimeout(600);
  st = await state();
  assert.equal(st.map, "abyss-F11", `杀完首领后 T 应深入 F11，实际 ${st.map}`);
  console.log("回归10b PASS：击败首领后深入 F11");

  assert.deepEqual(errors, [], `不应有页面错误：${errors.join(" | ")}`);
  console.log("ALL ABYSS TERRAIN TESTS PASSED");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
