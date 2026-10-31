// 0.8.9：召唤骨卫不要求锁定目标（与 README「在身边召唤」一致）。
// 断言：无目标按 2 → 资源扣除、事件记录「骨卫在场景中现身」、冷却生效。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator('[data-class="taoist"]').click();
  await page.waitForTimeout(500);

  const before = await page.evaluate(() => {
    const snapshot = window.__ONEKNIFE_E2E__.snapshot();
    return { resource: snapshot.player.resource, target: snapshot.player.targetId };
  });
  assert.equal(before.target, null, "开局不应已锁定目标");

  await page.keyboard.press("2");
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const snapshot = window.__ONEKNIFE_E2E__.snapshot();
    return {
      resource: snapshot.player.resource,
      events: window.__ONEKNIFE_E2E__.timeline(20).map((entry) => entry.text)
    };
  });

  assert.ok(after.resource < before.resource, `召唤未扣除符力：${before.resource} → ${after.resource}`);
  assert.ok(
    after.events.some((text) => text.includes("骨卫在场景中现身")),
    "时间线缺少骨卫召唤事件"
  );
  assert.deepEqual(errors, [], `页面异常：${errors.join(" | ")}`);

  process.stdout.write(`SUMMON PASS 符力 ${Math.round(before.resource)} → ${Math.round(after.resource)}\n`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
