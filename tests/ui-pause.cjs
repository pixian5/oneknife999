// 0.8.45 暂停与画面缩放回归：暂停必须冻结战斗时间，设置面板打开即暂停，缩放生效。
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
    await page.waitForTimeout(250);

    // 锁定一只普通怪，记录它和玩家的状态，用于判断暂停期间是否真的冻结。
    const target = await page.evaluate(async () => {
      const s = (await import("/src/runtime.js")).state;
      const entity = s.entities.find((item) => item.alive && !item.friendly && !item.npc && !item.boss);
      if (!entity) return null;
      s.player.x = entity.x - 120;
      s.player.y = entity.y;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const canvas = document.querySelector("#gameCanvas").getBoundingClientRect();
      const meta = window.__ONEKNIFE_E2E__.meta();
      return {
        id: entity.id,
        x: canvas.x + (entity.x - meta.camera.x) * meta.viewScale,
        y: canvas.y + (entity.y - entity.radius * 1.8 - meta.camera.y) * meta.viewScale,
        hp: entity.hp,
        playerHp: s.player.hp
      };
    });
    assert.ok(target, "第 1 关没有可锁定的普通怪");
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.targetId), target.id, "暂停前未能锁定目标");

    await page.locator("#pauseBtn").click();
    const pausedMeta = await page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
    assert.equal(pausedMeta.paused, true, "点暂停按钮后 meta.paused 应为 true");
    assert.equal(await page.locator("#pauseOverlay").isVisible(), true, "手动暂停应显示遮罩");

    const before = await page.evaluate((id) => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      const entity = s.entities.find((item) => item.id === id);
      return { enemyX: entity.x, enemyY: entity.y, enemyHp: entity.hp, playerHp: s.player.hp };
    }, target.id);
    await page.waitForTimeout(1500);
    const afterWait = await page.evaluate((id) => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      const entity = s.entities.find((item) => item.id === id);
      return { enemyX: entity.x, enemyY: entity.y, enemyHp: entity.hp, playerHp: s.player.hp };
    }, target.id);
    assert.deepEqual(afterWait, before, "暂停 1.5 秒期间敌人/血量发生变化，时间没有冻结");

    await page.keyboard.press("x");
    await page.waitForTimeout(250);
    const afterAttack = await page.evaluate((id) => {
      const entity = window.__ONEKNIFE_E2E__.snapshot().entities.find((item) => item.id === id);
      return entity.hp;
    }, target.id);
    assert.equal(afterAttack, before.enemyHp, "暂停期间按 X 仍然造成了伤害");

    await page.locator("#pauseOverlay").click();
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).paused, false, "点击遮罩后未恢复游戏");

    // 设置面板打开即暂停，关闭恢复；缩放档位写入 meta。
    await page.locator("#settingsBtn").click();
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).paused, true, "打开设置未暂停");
    assert.equal(await page.locator("#pauseOverlay").isVisible(), false, "设置触发的暂停不应显示遮罩");
    const baseScale = (await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).viewScale;
    await page.locator('[data-view-zoom="1.25"]').click();
    const zoomed = await page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
    assert.equal(zoomed.viewZoom, 1.25, "125% 缩放未生效");
    assert.ok(Math.abs(zoomed.viewScale - baseScale * 1.25) < 0.01, `viewScale 未随缩放变化：${baseScale} → ${zoomed.viewScale}`);
    await page.locator("[data-close-settings]").click();
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.__ONEKNIFE_E2E__.meta())).paused, false, "关闭设置后未恢复游戏");

    assert.deepEqual(errors, [], "暂停测试期间页面异常");
    process.stdout.write("UI pause + view zoom: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
