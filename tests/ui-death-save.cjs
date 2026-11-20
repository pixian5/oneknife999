// 0.8.52 回归：死亡后必须立即落盘，关闭浏览器不能丢死亡数、金币与复活位置。
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
    await page.waitForTimeout(160);
    const before = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4"));
      return { deaths: save.player.deaths || 0, gold: save.player.gold };
    });
    const after = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      runtime.state.player.hp = 0;
      await new Promise((resolve) => setTimeout(resolve, 260));
      const save = JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4"));
      return {
        stateDeaths: runtime.state.player.deaths,
        stateGold: runtime.state.player.gold,
        saveDeaths: save.player.deaths,
        saveGold: save.player.gold,
        saveX: Math.round(save.player.x),
        saveY: Math.round(save.player.y),
        town: runtime.activeMap().townRect
      };
    });
    assert.equal(after.stateDeaths, before.deaths + 1, "死亡数未递增");
    assert.equal(after.saveDeaths, after.stateDeaths, `死亡数未落盘：state=${after.stateDeaths} save=${after.saveDeaths}`);
    assert.equal(after.saveGold, after.stateGold, "金币未落盘");
    const inTown =
      after.saveX >= after.town.x &&
      after.saveX <= after.town.x + after.town.w &&
      after.saveY >= after.town.y &&
      after.saveY <= after.town.y + after.town.h;
    assert.equal(inTown, true, `复活位置不在安全营地：${after.saveX},${after.saveY}`);
    assert.deepEqual(errors, [], "death save 测试期间页面异常");
    process.stdout.write(`UI death save: PASS · deaths=${after.saveDeaths} · 复活 ${after.saveX},${after.saveY}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})();
