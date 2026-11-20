// 0.8.49 回归：鼠标点过普攻/技能后，悬浮说明必须收起；移出按钮后恢复。
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

    const attack = page.locator("#normalAttackBtn");
    await attack.hover();
    await page.waitForTimeout(120);
    assert.ok(await page.locator("#normalAttackBtn .skill-tooltip").isVisible(), "悬浮普攻时说明应显示");
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(120);
    assert.equal(await page.locator("#normalAttackBtn .skill-tooltip").isVisible(), false, "点过普攻后说明仍在挡视线");
    // 鼠标仍停在按钮上，工具提示必须保持收起。
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#normalAttackBtn .skill-tooltip").isVisible(), false, "点完等待后说明又自动弹出");
    // 移出再移回，恢复悬浮说明。
    await page.mouse.move(300, 300);
    await page.waitForTimeout(100);
    await attack.hover();
    await page.waitForTimeout(120);
    assert.ok(await page.locator("#normalAttackBtn .skill-tooltip").isVisible(), "移回普攻后说明未恢复");

    const skill = page.locator('[data-skill="0"]');
    await skill.hover();
    await page.waitForTimeout(120);
    assert.ok(await page.locator('[data-skill="0"] .skill-tooltip').isVisible(), "悬浮技能时说明应显示");
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('[data-skill="0"] .skill-tooltip').isVisible(), false, "点过技能后说明仍在");

    assert.deepEqual(errors, [], "tooltip 测试期间页面异常");
    process.stdout.write("UI tooltip suppression: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
