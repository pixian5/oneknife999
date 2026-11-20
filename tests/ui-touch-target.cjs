// 0.8.44 触屏点击锁定回归：手机视口下点怪物胸口/首领上半身应锁定，而不是走位。
// 用 Playwright 的 touchscreen.tap 触发真实 pointerdown，覆盖 0.8.43 的立绘胶囊判定。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const VIEWPORT = { width: 390, height: 844 };

async function tapEntity(page, entity, bodyOffset) {
  const geometry = await page.evaluate(async (id) => {
    const canvas = document.querySelector("#gameCanvas").getBoundingClientRect();
    const meta = window.__ONEKNIFE_E2E__.meta();
    return { canvas: { x: canvas.x, y: canvas.y }, meta, id };
  }, entity.id);
  const scale = geometry.meta.viewScale;
  const camera = geometry.meta.camera;
  const x = geometry.canvas.x + (entity.x - camera.x) * scale;
  const y = geometry.canvas.y + (entity.y - bodyOffset - camera.y) * scale;
  assert.ok(Number.isFinite(x) && Number.isFinite(y), `触屏坐标无效：${x},${y}`);
  assert.ok(x >= 0 && x <= VIEWPORT.width && y >= 0 && y <= VIEWPORT.height, `触屏点越出视口：${x},${y}`);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(250);
  return { x, y };
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(250);

    const normal = await page.evaluate(async () => {
      const s = (await import("/src/runtime.js")).state;
      const entity = s.entities.find((item) => item.alive && !item.friendly && !item.npc && !item.boss);
      if (!entity) return null;
      // 站到怪物脚下 60px，保证在锁定距离内、且不挡住点击点。
      s.player.x = entity.x - 60;
      s.player.y = entity.y;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { id: entity.id, name: entity.name, x: entity.x, y: entity.y, radius: entity.radius };
    });
    assert.ok(normal, "第 1 关没有可锁定的普通怪");
    await tapEntity(page, normal, normal.radius * 1.8);
    const afterNormal = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player);
    assert.equal(afterNormal.targetId, normal.id, `触屏点 ${normal.name} 胸口未锁定，target=${afterNormal.targetId}`);

    const boss = await page.evaluate(async () => {
      const s = (await import("/src/runtime.js")).state;
      const entity = s.entities.find((item) => item.alive && item.boss);
      if (!entity) return null;
      s.player.x = entity.x - 80;
      s.player.y = entity.y + 20;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { id: entity.id, name: entity.name, x: entity.x, y: entity.y, radius: entity.radius };
    });
    if (boss) {
      await tapEntity(page, boss, boss.radius * 2.4);
      const afterBoss = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player);
      assert.equal(afterBoss.targetId, boss.id, `触屏点首领 ${boss.name} 上半身未锁定，target=${afterBoss.targetId}`);
    } else {
      process.stdout.write("TOUCH boss: 当前地图无首领，跳过\n");
    }

    assert.deepEqual(errors, [], "触屏测试期间页面异常");
    process.stdout.write("TOUCH target lock 390x844: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
