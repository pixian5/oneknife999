// 0.8.53 回归：首领交战中，首领周围的普通怪不能按重生计时复活；脱战后要恢复。
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
    await page.waitForTimeout(180);
    const during = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const s = runtime.state;
      const boss = s.entities.find((entity) => entity.boss && entity.alive);
      boss.hp = boss.maxHp - 80; // 模拟首领已受伤，进入交战
      boss.aggro = true;
      const add = s.entities.find(
        (entity) =>
          entity.alive && !entity.boss && !entity.friendly && !entity.npc && Math.hypot(entity.x - boss.x, entity.y - boss.y) < 220
      );
      if (!add) return { missing: true };
      add.alive = false;
      add.hp = 0;
      add.respawn = 0.12;
      await new Promise((resolve) => setTimeout(resolve, 320));
      return { name: add.name, alive: add.alive, respawn: add.respawn };
    });
    assert.notEqual(during.missing, true, "测试地图首领附近没有普通怪");
    assert.equal(during.alive, false, `首领交战中小怪仍复活：${during.name}`);
    const after = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const s = runtime.state;
      const boss = s.entities.find((entity) => entity.boss && entity.alive);
      boss.hp = boss.maxHp;
      boss.aggro = false;
      const add = s.entities.find(
        (entity) =>
          !entity.alive && !entity.boss && !entity.friendly && !entity.npc && Math.hypot(entity.x - boss.x, entity.y - boss.y) < 220
      );
      add.respawn = 0.12;
      await new Promise((resolve) => setTimeout(resolve, 320));
      return { name: add.name, alive: add.alive, respawn: add.respawn };
    });
    assert.notEqual(after.missing, true, "脱战后找不到待复活的测试小怪");
    assert.equal(after.alive, true, `脱战后小怪未恢复复活：${after.name}`);
    assert.deepEqual(errors, [], "boss trash hold 测试期间页面异常");
    process.stdout.write(`UI boss trash hold: PASS · ${during.name}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})();
