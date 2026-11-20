// 0.8.54 回归：首领倒下时清空附近小怪，避免玩家刚击杀首领就被杂兵补刀。
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
    const result = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const main = await import("/src/main.js");
      const s = runtime.state;
      const boss = s.entities.find((entity) => entity.boss && entity.alive);
      const adds = s.entities.filter((entity) => entity.alive && !entity.boss && !entity.friendly && !entity.npc);
      if (!boss || !adds.length) return { missing: true };
      const near = adds[0];
      near.x = boss.x + 80;
      near.y = boss.y;
      near.hp = 100;
      const far = adds.find((entity) => entity !== near);
      if (far) {
        far.x = boss.x + 600;
        far.y = boss.y;
      }
      main.defeat(boss);
      await new Promise((resolve) => setTimeout(resolve, 160));
      return {
        nearAlive: near.alive,
        farAlive: far ? far.alive : "no-far",
        victory: s.player.victoryTimer,
        bossDefeated: runtime.mapProgress().bossDefeated
      };
    });
    assert.ok(!result.missing, "测试地图缺少首领或小怪");
    assert.equal(result.nearAlive, false, "首领附近小怪未被余波清空");
    assert.equal(result.farAlive, true, "260px 外的小怪不应被余波误杀");
    assert.equal(result.bossDefeated, true, "首领击杀未写入关卡进度");
    assert.ok(result.victory > 0, "首领击杀未进入胜利动作窗口");
    assert.deepEqual(errors, [], "boss victory clear 测试期间页面异常");
    process.stdout.write("UI boss victory clear: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
