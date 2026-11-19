// 换图落盘回归（0.8.40 / T-04、T-05、T-06）
// 背景：doTravel() → loadMap() 全程无 persistGame()，换图后刷新会退回上一图。
// 陷阱：新号进新图时 update() 里的 advanceGuide(99) 会顺手落盘，把 bug 掩盖掉；
//       所以本用例必须分别以 guideStep=99（老档）与 guideStep=1（新档）各跑一遍。
//
// 运行：node tests/ui-travel-persist.cjs
// 依赖：先起服务 `python3 -m http.server 4174 --directory game`
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";

const snapshot = (page) => page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), SAVE_KEY);

async function bootToFirstMap(browser, guideStep) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__, null, { timeout: 30000 });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForTimeout(200);

  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
  const current = catalog[0];
  const next = catalog[1];
  const save = await readSave(page);
  assert.ok(save, "选职业后应有存档（0.8.6 行为）");

  // 造一个"当前图已通关 + 指定引导状态"的档，绕开刷怪，只验证换图是否落盘。
  save.currentMapId = current.id;
  save.player.guideStep = guideStep;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress[current.id] = {
    ...(save.mapProgress[current.id] || {}),
    need: current.need,
    kills: current.need,
    bossDefeated: true,
    completed: true
  };
  await page.evaluate(([key, payload]) => localStorage.setItem(key, JSON.stringify(payload)), [SAVE_KEY, save]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__ && window.__ONEKNIFE_E2E__.snapshot(), null, { timeout: 30000 });
  const afterReload = await snapshot(page);
  assert.equal(afterReload.currentMapId, current.id, "造档后应停在该图");
  assert.ok(afterReload.progress[current.id]?.completed, "造档后该图应为已通关");
  return { context, page, errors, current, next };
}

async function travelOnce(page) {
  // 记录换图期间所有存档写入：既证明"确实写了"，也避免被别处的落盘掩盖成假绿。
  await page.evaluate((key) => {
    window.__travelWrites = [];
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (name, value) => {
      if (name === key) window.__travelWrites.push(String(new Error().stack || ""));
      return original(name, value);
    };
  }, SAVE_KEY);

  // 注意：低等级/危险图才会弹「仍要进入」；普通换图按 T 直接切图，没有确认框。
  const before = (await snapshot(page)).currentMapId;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.keyboard.press("t");
    await page.waitForTimeout(500);
    const confirm = page.locator("[data-travel-ok]");
    if ((await confirm.count()) > 0 && (await confirm.first().isVisible())) {
      await confirm.first().click();
      await page.waitForTimeout(900);
      return;
    }
    if ((await snapshot(page)).currentMapId !== before) return;
  }
  assert.fail(`按 T 既未换图也未出现确认框（起点 ${before}）`);
}

async function runScenario(browser, guideStep, label) {
  const { context, page, errors, current, next } = await bootToFirstMap(browser, guideStep);
  try {
    await travelOnce(page);
    const runtime = await snapshot(page);
    assert.equal(runtime.currentMapId, next.id, `${label}：换图后运行时地图应为 ${next.id}`);

    const writes = await page.evaluate(() => window.__travelWrites || []);
    assert.ok(writes.length > 0, `${label}：换图期间没有任何存档写入——doTravel() 仍未调用 persistGame()`);
    assert.ok(
      writes.some((stack) => /doTravel|loadMap/.test(stack)),
      `${label}：换图期间的存档写入不是来自换图路径（可能被引导/拾取等事件掩盖）：\n${writes.join("\n---\n")}`
    );

    const saved = await readSave(page);
    assert.equal(saved.currentMapId, next.id, `${label}：存档 currentMapId 应为 ${next.id}，实际 ${saved.currentMapId}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__ && window.__ONEKNIFE_E2E__.snapshot(), null, { timeout: 30000 });
    const restored = await snapshot(page);
    assert.equal(restored.currentMapId, next.id, `${label}：刷新后应回到 ${next.id}，实际退回 ${restored.currentMapId}`);
    assert.equal(restored.stageNumber, next.stageNumber, `${label}：刷新后关卡序号应保持`);
    assert.deepEqual(errors, [], `${label}：页面异常`);
    console.log(`PASS travel-persist [${label}] ${current.id} -> ${next.id}（写入 ${writes.length} 次）`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    // T-04：老档（引导已完成）——当前基线必红，修复后应绿
    await runScenario(browser, 99, "guideStep=99 老档");
    // T-05：新档（引导进行中）——防止再次被 advanceGuide(99) 的落盘掩盖
    await runScenario(browser, 1, "guideStep=1 新档");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("FAIL", error && error.message ? error.message : error);
  process.exit(1);
});
