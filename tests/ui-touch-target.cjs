// 0.8.44 触屏点击锁定回归：手机视口下点怪物胸口/首领上半身应锁定，而不是走位。
// 用 Playwright 的 touchscreen.tap 触发真实 pointerdown，覆盖 0.8.43 的立绘胶囊判定。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const VIEWPORT = { width: 390, height: 844 };

async function tapEntity(page, entity, bodyFraction) {
  // 0.8.45 修正：必须用点击前一刻的实体制服坐标。首领在玩家靠近后会移动，
  // 若用 150ms 前序列化出来的 x/y，点到的可能是旁边的小怪。
  const point = await page.evaluate(
    async ({ id, fraction }) => {
      const s = (await import("/src/runtime.js")).state;
      const live = s.entities.find((item) => item.id === id);
      if (!live) return null;
      // 用渲染侧同一套脚底锚点与 spriteHeight，点击点一定落在画出来的立绘内部。
      const { spriteHeight } = await import("/src/render.js");
      const footY = live.y + live.radius * (live.boss ? 0.9 : 0.55);
      const bodyY = footY - spriteHeight(live) * fraction;
      const canvas = document.querySelector("#gameCanvas").getBoundingClientRect();
      const meta = window.__ONEKNIFE_E2E__.meta();
      return {
        x: canvas.x + (live.x - meta.camera.x) * meta.viewScale,
        y: canvas.y + (bodyY - meta.camera.y) * meta.viewScale
      };
    },
    { id: entity.id, fraction: bodyFraction }
  );
  assert.ok(point, `点击时目标 ${entity.id} 已不存在`);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `触屏坐标无效：${point.x},${point.y}`);
  assert.ok(
    point.x >= 0 && point.x <= VIEWPORT.width && point.y >= 0 && point.y <= VIEWPORT.height,
    `触屏点越出视口：${point.x},${point.y}`
  );
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(250);
  return point;
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
    await tapEntity(page, normal, 0.55);
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
      const targetBeforeBossTap = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.targetId);
      const bossPoint = await tapEntity(page, boss, 0.75);
      const afterBoss = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player);
      if (afterBoss.targetId !== boss.id) {
        const diag = await page.evaluate(
          async ({ id, point, beforeTarget }) => {
            const s = (await import("/src/runtime.js")).state;
            const boss = s.entities.find((item) => item.id === id);
            return {
              point,
              beforeTarget,
              boss: { x: boss.x, y: boss.y, radius: boss.radius, alive: boss.alive, boss: boss.boss, hp: boss.hp },
              toast: document.querySelector("#toast")?.textContent || ""
            };
          },
          { id: boss.id, point: bossPoint, beforeTarget: targetBeforeBossTap }
        );
        assert.equal(
          afterBoss.targetId,
          boss.id,
          `触屏点首领 ${boss.name} 上半身未锁定，target=${afterBoss.targetId} debug=${JSON.stringify(diag)}`
        );
      }
    } else {
      process.stdout.write("TOUCH boss: 当前地图无首领，跳过\n");
    }

    // 0.8.45：手机上也必须能暂停/恢复；暂停按钮和遮罩都要能被手指点中。
    await page.locator("#pauseBtn").tap();
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).paused, true, "触屏点暂停按钮未生效");
    assert.equal(await page.locator("#pauseOverlay").isVisible(), true, "触屏暂停未显示遮罩");
    await page.locator("#pauseOverlay").tap();
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).paused, false, "触屏点遮罩未恢复游戏");

    assert.deepEqual(errors, [], "触屏测试期间页面异常");
    process.stdout.write("TOUCH target lock + pause 390x844: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
