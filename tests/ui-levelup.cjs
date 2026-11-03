// 升级体验回归（0.3.2）：真实浏览器里在首关击杀进度怪，必须在见到首领前升到 2 级。
// 背景：0.3.1 之前击杀经验被 Math.min(99, …) 截断、等级只在通关时重算，导致「打半天怪不升级」。
// 运行方式：npm run test:ui:levelup（需先 npm run serve）。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1&fast=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(250);

    const snap = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
    const meta = await page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
    const rect = await page.locator("#gameCanvas").boundingBox();
    const target = snap.entities
      .filter((entity) => entity.alive && !entity.boss)
      .sort((a, b) => Math.hypot(a.x - snap.player.x, a.y - snap.player.y) - Math.hypot(b.x - snap.player.x, b.y - snap.player.y))[0];
    assert.ok(target, "首关应存在可攻击的普通怪");
    assert.equal(snap.player.level, 1, "初始等级应为 1");

    // 坐标换算与 canvasPoint 一致：屏幕 = 画布左上 + (世界 - 相机) × 缩放。
    const screenX = rect.x + (target.x - meta.camera.x) * meta.viewScale;
    const screenY = rect.y + (target.y - meta.camera.y) * meta.viewScale;
    assert.ok(screenX > rect.x && screenX < rect.x + rect.width, `目标不在视口内：x=${screenX}`);
    await page.mouse.click(screenX, screenY);

    // 普攻 X：首次点击怪物会锁定并自动接近，之后每 180ms 一次直到升级。
    // 0.3.2：击杀后目标会清空，必须像真实玩家一样继续选择最近的怪（否则无目标时按 X 不会移动）。
    let leveled = null;
    for (let step = 0; step < 200 && !leveled; step += 1) {
      const current = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
      assert.equal(current.currentMapId, snap.currentMapId, "升级过程中不应离开首关");
      if (current.player.level >= 2) {
        leveled = current;
        break;
      }
      const metaNow = await page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
      const nearest = current.entities
        .filter((entity) => entity.alive && !entity.boss)
        .sort(
          (a, b) => Math.hypot(a.x - current.player.x, a.y - current.player.y) - Math.hypot(b.x - current.player.x, b.y - current.player.y)
        )[0];
      if (nearest) {
        const distance = Math.hypot(nearest.x - current.player.x, nearest.y - current.player.y);
        if (distance > 250) {
          // 目标较远时用键盘接近（屏幕上可能被右侧 HUD 遮挡，直接点击会点到面板）。
          const dx = nearest.x - current.player.x;
          const dy = nearest.y - current.player.y;
          const hKey = dx < 0 ? "a" : "d";
          const vKey = dy < 0 ? "w" : "s";
          if (Math.abs(dx) > 30) await page.keyboard.down(hKey);
          if (Math.abs(dy) > 30) await page.keyboard.down(vKey);
          await page.waitForTimeout(320);
          if (Math.abs(dx) > 30) await page.keyboard.up(hKey);
          if (Math.abs(dy) > 30) await page.keyboard.up(vKey);
          continue;
        }
        const nx = rect.x + (nearest.x - metaNow.camera.x) * metaNow.viewScale;
        const ny = rect.y + (nearest.y - metaNow.camera.y) * metaNow.viewScale;
        if (nx > rect.x + 4 && nx < rect.x + rect.width - 4 && ny > rect.y + 4 && ny < rect.y + rect.height - 4) {
          await page.mouse.click(nx, ny);
        }
      }
      await page.keyboard.press("x");
      await page.waitForTimeout(180);
    }
    if (!leveled) {
      const last = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
      leveled = last.player.level >= 2 ? last : null;
    }
    assert.ok(leveled, "首关击杀进度怪后仍未升级（普攻 X / 击杀经验回归）");
    assert.equal(leveled.player.level, 2, `本关等级上限应为 2，实际 ${leveled.player.level}`);
    assert.equal(leveled.player.nextExp, 100, "升级所需经验应为 100");
    assert.ok(leveled.player.exp >= 0 && leveled.player.exp <= 100, `经验应落在 [0,100]，实际 ${leveled.player.exp}`);
    assert.deepEqual(errors, [], "升级回归期间页面异常");
    process.stdout.write(
      `LEVELUP PASS Lv.${leveled.player.level} exp=${leveled.player.exp}/100 kills=${leveled.progress[snap.currentMapId].kills}\n`
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
