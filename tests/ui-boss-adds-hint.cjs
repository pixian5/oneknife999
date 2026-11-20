// 0.8.50 回归：清完 8/8 后，目标卡必须提示首领身边还有几只小怪，避免新手被围死。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(220);
    const count = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const s = runtime.state;
      const progress = runtime.mapProgress();
      progress.kills = progress.need;
      const boss = s.entities.find((entity) => entity.boss && entity.alive);
      const adds = boss
        ? s.entities.filter(
            (entity) =>
              entity.alive && !entity.boss && !entity.friendly && !entity.npc && Math.hypot(entity.x - boss.x, entity.y - boss.y) < 180
          ).length
        : 0;
      await new Promise((resolve) => setTimeout(resolve, 160));
      return { adds, text: document.querySelector("#mapObjective").textContent.replace(/\s+/g, " ").trim() };
    });
    assert.ok(count.adds > 0, "测试地图首领身边没有小怪，无法验证提示");
    assert.match(count.text, new RegExp(`首领身边还有 ${count.adds} 只小怪`), `目标卡未提示小怪数量：${count.text}`);
    assert.match(count.text, /先清小怪或用范围技能/, `目标卡缺少处理建议：${count.text}`);
    assert.deepEqual(errors, [], "boss adds hint 测试期间页面异常");
    process.stdout.write(`UI boss adds hint: PASS · ${count.adds} 只小怪\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})();
