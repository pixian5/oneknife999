// 内存长跑（T-12）：连打 10 张图，观察 JS 堆增长与页面错误。
// 为什么必须测：本容器 4 GiB，chromium 已被内核杀过 5 次；单图冒烟看不出累积泄漏。
// 运行：ONEKNIFE_CHROMIUM_PATH=/usr/bin/chromium node tests/ui-memory-soak.cjs
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const MAPS = Number(process.env.ONEKNIFE_SOAK_MAPS || 10);
const HEAP_BUDGET_MB = Number(process.env.ONEKNIFE_HEAP_BUDGET_MB || 40);

const heapMb = (page) => page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null));

async function clearMap(page) {
  for (let round = 0; round < 12; round += 1) {
    const done = await page.evaluate(() => {
      const snapshot = window.__ONEKNIFE_E2E__.snapshot();
      const alive = (snapshot.entities || []).filter((entity) => entity.alive && entity.hp > 0);
      for (const entity of alive) window.__ONEKNIFE_E2E__.strike(entity.id, 9999999);
      const current = snapshot.progress[snapshot.currentMapId] || {};
      return { cleared: alive.length === 0 && (current.completed || (current.kills >= current.need && current.bossDefeated)) };
    });
    await page.waitForTimeout(250);
    if (done.cleared) return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__, null, { timeout: 30000 });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForTimeout(300);

  const samples = [];
  const visited = [];
  for (let index = 0; index < MAPS; index += 1) {
    const before = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
    visited.push(before.currentMapId);
    const cleared = await clearMap(page);
    assert.ok(cleared, `第 ${index + 1} 张图（${before.currentMapId}）未能清空`);
    await page.waitForTimeout(200);
    const measured = await heapMb(page);
    if (measured !== null) samples.push({ map: before.currentMapId, heap: measured });
    if (index === MAPS - 1) break;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.keyboard.press("t");
      await page.waitForTimeout(500);
      const confirm = page.locator("[data-travel-ok]");
      if ((await confirm.count()) > 0 && (await confirm.first().isVisible())) await confirm.first().click();
      const now = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().currentMapId);
      if (now !== before.currentMapId) break;
      assert.ok(attempt < 4, `第 ${index + 1} 张图通关后按 T 未能前进`);
    }
  }

  const unique = new Set(visited).size;
  assert.ok(unique >= Math.min(MAPS, 2), `只访问了 ${unique} 张图，长跑没有真正推进`);
  assert.deepEqual(errors, [], "长跑期间页面异常");

  if (samples.length >= 2) {
    const growth = +(samples[samples.length - 1].heap - samples[0].heap).toFixed(1);
    console.log("堆采样：", samples.map((sample) => `${sample.map}=${sample.heap}MB`).join(" → "));
    console.log(`增长 ${growth} MB（预算 ${HEAP_BUDGET_MB} MB）`);
    assert.ok(growth <= HEAP_BUDGET_MB, `JS 堆增长 ${growth} MB 超过预算 ${HEAP_BUDGET_MB} MB`);
  } else {
    console.log("performance.memory 不可用，跳过堆断言（本用例仍校验清图与换图流程）");
  }

  console.log(`PASS memory-soak 连打 ${MAPS} 张图，访问 ${unique} 张`);
  await browser.close();
})().catch((error) => {
  console.error("FAIL", error && error.message ? error.message : error);
  process.exit(1);
});
