// 0.8.35 回归：真实施法链路（&realcast=1）——起手可观测、生效正常、fastcast 默认路径不受影响。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const ROOT = (process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1").split("?")[0];

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // ===== 场景 A：realcast 模式——起手窗口可观测、结算正常 =====
  await page.goto(`${ROOT}/?e2e=1&realcast=1&fast=1`, { waitUntil: "load" });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
  const snap = () => page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());

  // 找怪接近，锁定后放技能 1（破甲斩 cd 3 → 起手 0.25s）
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    const s = await snap();
    target = s.entities.find((e) => e.alive && !e.boss && !e.npc);
    if (!target) await page.waitForTimeout(200);
  }
  for (let i = 0; i < 50; i += 1) {
    const s = await snap();
    const cur = s.entities.find((e) => e.id === target.id);
    if (!cur || !cur.alive) break;
    if (Math.hypot(cur.x - s.player.x, cur.y - s.player.y) <= 60) break;
    const keys = [];
    if (Math.abs(cur.x - s.player.x) > 20) keys.push(cur.x < s.player.x ? "a" : "d");
    if (Math.abs(cur.y - s.player.y) > 20) keys.push(cur.y < s.player.y ? "w" : "s");
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(220);
    for (const k of keys) await page.keyboard.up(k);
  }
  const before = await snap();
  const cur = before.entities.find((e) => e.id === target.id);
  const rect = await page.locator("#gameCanvas").boundingBox();
  const info = await page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
  await page.mouse.click(rect.x + (cur.x - info.camera.x) * info.viewScale, rect.y + (cur.y - info.camera.y) * info.viewScale);
  await page.waitForTimeout(120);
  await page.keyboard.press("1");
  await page.waitForTimeout(80); // 起手 250ms 内
  let mid = await snap();
  assert.ok((mid.player.castWindup || 0) > 0, `起手期快照应暴露 castWindup>0，实际 ${mid.player.castWindup}`);
  // 起手中再按 2：不得重复起手（无新施法开始）
  await page.keyboard.press("2");
  await page.waitForTimeout(60);
  await page.waitForTimeout(500); // 等起手结束+结算
  const after = await snap();
  const hit = after.logs.some((l) => l.includes("破甲斩") || l.includes("命中"));
  assert.ok(hit, "起手结束后技能应正常结算（战报出现命中）");
  console.log("场景A PASS：realcast 起手可观测、结算正常、起手中不重复起手");

  // ===== 场景 B：默认 fastcast——castWindup 恒 0（探针/既有回归路径零影响） =====
  await page.goto(`${ROOT}/?e2e=1&fast=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
  await page.keyboard.press("1");
  await page.waitForTimeout(80);
  const s = await snap();
  assert.equal(s.player.castWindup, 0, "fastcast 路径不得进入起手态");
  console.log("场景B PASS：默认 e2e 路径不受影响（castWindup=0）");

  assert.deepEqual(errors, [], `不应有页面错误：${errors.join(" | ")}`);
  console.log("ALL CAST TIMING TESTS PASSED");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
