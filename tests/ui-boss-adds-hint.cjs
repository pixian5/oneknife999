// 0.8.50 回归：清完 8/8 后，目标卡必须提示首领附近还有几只小怪，避免新手被围死。
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
      const adds = boss ? s.entities.filter((entity) => entity.alive && !entity.boss && !entity.friendly && !entity.npc) : [];
      if (!boss || adds.length < 2) return { missing: true };
      // 把所有小怪先挪远，只留一只在 230px（旧 180 阈值会漏、260 应命中），另一只在 300px 外。
      for (const add of adds) {
        add.x = boss.x + 600;
        add.y = boss.y + 200;
      }
      adds[0].x = boss.x + 230;
      adds[0].y = boss.y;
      adds[1].x = boss.x + 300;
      adds[1].y = boss.y;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const nearText = document.querySelector("#mapObjective").textContent.replace(/\s+/g, " ").trim();
      // 把 230px 的那只也推到 300px，目标卡应回到“前往首领区域”。
      adds[0].x = boss.x + 300;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const farText = document.querySelector("#mapObjective").textContent.replace(/\s+/g, " ").trim();
      return { missing: false, nearText, farText };
    });
    assert.ok(!count.missing, "测试地图首领或小怪不足，无法验证提示");
    assert.match(count.nearText, /首领附近还有 1 只小怪/, `230px 小怪未被 260 阈值统计：${count.nearText}`);
    assert.match(count.nearText, /先清小怪或用范围技能/, `目标卡缺少处理建议：${count.nearText}`);
    assert.doesNotMatch(count.farText, /首领附近还有/, `300px 小怪不应计入提示：${count.farText}`);
    assert.match(count.farText, /前往首领区域完成关卡/, `无小怪时未回到前往首领区域：${count.farText}`);
    assert.deepEqual(errors, [], "boss adds hint 测试期间页面异常");
    process.stdout.write(`UI boss adds hint: PASS · 230px 命中 / 300px 排除\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})();
