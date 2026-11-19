// 换图竞态（T-19）：点「仍要进入」后立刻刷新，页面不能崩、存档不能写坏。
// 背景：换图要重建整张地图（实体/危险区/相机），若存档写在 rebuild 中途，刷新会读到半截状态。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__, null, { timeout: 30000 });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForTimeout(250);

  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
  const current = catalog[0];
  const next = catalog[1];
  await page.evaluate(
    ([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)),
    [
      SAVE_KEY,
      {
        ...(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY)),
        currentMapId: current.id,
        mapProgress: { [current.id]: { need: current.need, kills: current.need, bossDefeated: true, completed: true } }
      }
    ]
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__ && window.__ONEKNIFE_E2E__.snapshot(), null, { timeout: 30000 });

  // 不等待、不点击确认框，直接刷新：模拟玩家手抖/断网重连。
  await page.keyboard.press("t");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__ && window.__ONEKNIFE_E2E__.snapshot(), null, { timeout: 30000 });

  const after = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
  const save = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  assert.ok([current.id, next.id].includes(after.currentMapId), `竞态后地图异常：${after.currentMapId}`);
  assert.ok(save && save.currentMapId === after.currentMapId, `存档 ${save && save.currentMapId} 与运行时 ${after.currentMapId} 不一致`);
  assert.ok(after.player.hp > 0, "竞态后玩家血量异常");
  assert.deepEqual(errors, [], "竞态期间页面异常");

  console.log(`PASS travel-race 竞态后停留在 ${after.currentMapId}`);
  await browser.close();
})().catch((error) => {
  console.error("FAIL", error && error.message ? error.message : error);
  process.exit(1);
});
